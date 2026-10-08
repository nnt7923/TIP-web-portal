import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import * as yauzl from 'yauzl';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { MAX_UPLOAD_BYTES } from './upload-limits';

export type UploadedCvFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
};

const invalidCv = () =>
  new BadRequestException(
    'CV phải là PDF, DOC hoặc DOCX hợp lệ, tối đa 4 MiB. Không nhận Word mã hóa hoặc có macro.',
  );

export function cvUploadOptions(file: UploadedCvFile) {
  return {
    folder: 'students/cvs',
    resource_type: 'raw' as const,
    public_id: `${randomUUID()}${extname(file.originalname).toLowerCase()}`,
    overwrite: false,
  };
}

// Run the legacy binary parser outside the event loop with a hard CPU/memory
// budget. A malformed sector chain must not block the API process.
function validateDoc(buffer: Buffer): Promise<boolean> {
  return new Promise((resolve) => {
    const worker = new Worker(
      `
      const { parentPort, workerData } = require('node:worker_threads');
      const CFB = require(workerData.modulePath);
      try {
        const buffer = Buffer.from(workerData.buffer);
        let valid = false;
        if (buffer.length >= 512 && buffer.subarray(0, 8).equals(Buffer.from('d0cf11e0a1b11ae1', 'hex'))) {
          const container = CFB.read(buffer, { type: 'buffer' });
          const unsafe = container.FullPaths.some(path => /(?:^|\\/)(?:vba|macros|encryptedpackage|encryptioninfo)(?:\\/|$)/i.test(path));
          const word = CFB.find(container, 'WordDocument');
          if (!unsafe && word && word.content.length >= 32) {
            const fib = Buffer.from(word.content);
            const flags = fib.readUInt16LE(10);
            const table = CFB.find(container, flags & 0x0200 ? '1Table' : '0Table');
            valid = fib.readUInt16LE(0) === 0xa5ec && fib.readUInt16LE(2) >= 0xc1 && !(flags & 0x8100) && !!table && table.content.length > 0;
          }
        }
        parentPort.postMessage(valid);
      } catch { parentPort.postMessage(false); }
    `,
      {
        eval: true,
        workerData: { buffer, modulePath: require.resolve('cfb') },
        resourceLimits: { maxOldGenerationSizeMb: 64, stackSizeMb: 2 },
      },
    );
    let done = false;
    const finish = (valid: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      void worker.terminate();
      resolve(valid);
    };
    const timer = setTimeout(() => finish(false), 2000);
    worker.once('message', (valid: unknown) => finish(valid === true));
    worker.once('error', () => finish(false));
    worker.once('exit', () => finish(false));
  });
}

// Only the XML needed to identify a Word package is inflated. All entry sizes
// are checked first; no archive paths are ever written to disk.
function validateDocx(buffer: Buffer): Promise<boolean> {
  return new Promise((resolve) => {
    yauzl.fromBuffer(
      buffer,
      { lazyEntries: true, validateEntrySizes: true },
      (error, zip) => {
        if (error || !zip) return resolve(false);
        let settled = false;
        const finish = (valid: boolean) => {
          if (settled) return;
          settled = true;
          zip.close();
          resolve(valid);
        };
        if (zip.entryCount > 2048) return finish(false);
        const names = new Set<string>();
        const xml = new Map<string, string>();
        let expandedSize = 0;
        zip.on('error', () => finish(false));
        zip.on('entry', (entry: yauzl.Entry) => {
          const name = entry.fileName;
          expandedSize += entry.uncompressedSize;
          if (
            names.has(name) ||
            entry.isEncrypted() ||
            expandedSize > 32 * 1024 * 1024 ||
            /(?:vbaProject|vbaData|encryptioninfo|encryptedpackage)/i.test(
              name,
            ) ||
            ![0, 8].includes(entry.compressionMethod)
          )
            return finish(false);
          names.add(name);
          if (
            ![
              '[Content_Types].xml',
              '_rels/.rels',
              'word/document.xml',
            ].includes(name)
          ) {
            zip.readEntry();
            return;
          }
          if (entry.uncompressedSize > 8 * 1024 * 1024) return finish(false);
          zip.openReadStream(entry, (streamError, stream) => {
            if (streamError || !stream) return finish(false);
            const chunks: Buffer[] = [];
            let size = 0;
            stream.on('error', () => finish(false));
            stream.on('data', (chunk: Buffer) => {
              size += chunk.length;
              if (size > 8 * 1024 * 1024) {
                stream.destroy();
                finish(false);
              } else chunks.push(chunk);
            });
            stream.on('end', () => {
              if (settled) return;
              xml.set(name, Buffer.concat(chunks).toString('utf8'));
              zip.readEntry();
            });
          });
        });
        zip.on('end', () => {
          try {
            if (xml.size !== 3) return finish(false);
            for (const text of xml.values()) {
              if (
                /<!DOCTYPE|<!ENTITY/i.test(text) ||
                XMLValidator.validate(text) !== true
              )
                return finish(false);
            }
            const parser = new XMLParser({
              ignoreAttributes: false,
              removeNSPrefix: true,
              processEntities: false,
            });
            const types = parser.parse(xml.get('[Content_Types].xml')!) as {
              Types?: {
                Override?:
                  | { '@_PartName'?: string; '@_ContentType'?: string }
                  | { '@_PartName'?: string; '@_ContentType'?: string }[];
              };
            };
            const overrides = [types.Types?.Override ?? []].flat();
            const mainType =
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';
            if (
              !overrides.some(
                (part) =>
                  part['@_PartName'] === '/word/document.xml' &&
                  part['@_ContentType'] === mainType,
              )
            )
              return finish(false);
            if (
              /macroEnabled|vbaProject|vbaData/i.test(
                xml.get('[Content_Types].xml')!,
              )
            )
              return finish(false);
            const rels = parser.parse(xml.get('_rels/.rels')!) as {
              Relationships?: {
                Relationship?:
                  | {
                      '@_Type'?: string;
                      '@_Target'?: string;
                      '@_TargetMode'?: string;
                    }
                  | {
                      '@_Type'?: string;
                      '@_Target'?: string;
                      '@_TargetMode'?: string;
                    }[];
              };
            };
            if (
              ![rels.Relationships?.Relationship ?? []]
                .flat()
                .some(
                  (rel) =>
                    [
                      'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',
                      'http://purl.oclc.org/ooxml/officeDocument/relationships/officeDocument',
                    ].includes(rel['@_Type'] ?? '') &&
                    ['word/document.xml', '/word/document.xml'].includes(
                      rel['@_Target'] ?? '',
                    ) &&
                    rel['@_TargetMode'] !== 'External',
                )
            )
              return finish(false);
            const document = new XMLParser({
              ignoreAttributes: false,
              processEntities: false,
            }).parse(xml.get('word/document.xml')!) as Record<
              string,
              Record<string, unknown>
            >;
            const rootName = Object.keys(document).find((name) =>
              /^(?:[^:]+:)?document$/.test(name),
            );
            if (!rootName) return finish(false);
            const root = document[rootName];
            const prefix = rootName.includes(':') ? rootName.split(':')[0] : '';
            const namespace = root[prefix ? `@_xmlns:${prefix}` : '@_xmlns'];
            const wordNamespaces = [
              'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
              'http://purl.oclc.org/ooxml/wordprocessingml/main',
            ];
            finish(
              wordNamespaces.includes(String(namespace)) &&
                `${prefix ? `${prefix}:` : ''}body` in root,
            );
          } catch {
            finish(false);
          }
        });
        zip.readEntry();
      },
    );
  });
}

@Injectable()
export class OptionalCvPipe implements PipeTransform<
  UploadedCvFile | undefined
> {
  async transform(file: UploadedCvFile | undefined) {
    if (!file) return file;
    if (!file.buffer?.length || file.buffer.length > MAX_UPLOAD_BYTES)
      throw invalidCv();
    let valid = false;
    try {
      switch (extname(file.originalname).toLowerCase()) {
        case '.pdf':
          // Some PDF exporters prepend whitespace. Accept only whitespace before
          // the signature within the first 1 KiB; do not scan arbitrary payloads.
          valid = /^[\t\n\f\r ]*%PDF-\d\.\d/.test(
            file.buffer.subarray(0, 1024).toString('latin1'),
          );
          break;
        case '.doc':
          valid = await validateDoc(file.buffer);
          break;
        case '.docx':
          valid = await validateDocx(file.buffer);
          break;
      }
    } catch {
      valid = false;
    }
    if (!valid) throw invalidCv();
    return file;
  }
}
