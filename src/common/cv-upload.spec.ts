import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as CFB from 'cfb';
import { OptionalCvPipe, cvUploadOptions, UploadedCvFile } from './cv-upload';
import { MAX_UPLOAD_BYTES } from './upload-limits';

const doc = readFileSync(join(__dirname, 'fixtures/simple.doc'));
const docx = readFileSync(join(__dirname, 'fixtures/sample.docx'));
const pdf = readFileSync(join(__dirname, 'fixtures/sample.pdf'));
const file = (name: string, buffer: Buffer, mimetype = ''): UploadedCvFile => ({
  originalname: name,
  buffer,
  mimetype,
});

function zipEdit(edit: (archive: CFB.CFB$Container) => void): Buffer {
  const archive = CFB.read(docx, { type: 'buffer' });
  edit(archive);
  return CFB.write(archive, {
    type: 'buffer',
    fileType: 'zip',
    compression: true,
  }) as Buffer;
}

describe('CV content validation', () => {
  const pipe = new OptionalCvPipe();
  it.each([
    ['CV.PDF', pdf, ''],
    ['cv.pdf', pdf, 'application/octet-stream'],
    ['CV.DOC', doc, 'application/pdf'],
    ['CV.DOCX', docx, ''],
  ])(
    'accepts %s by content despite unreliable MIME',
    async (name, buffer, mime) => {
      const upload = file(name, buffer, mime);
      await expect(pipe.transform(upload)).resolves.toBe(upload);
    },
  );
  it('allows omission and exactly 4 MiB', async () => {
    await expect(pipe.transform(undefined)).resolves.toBeUndefined();
    await expect(
      pipe.transform(
        file(
          'cv.pdf',
          Buffer.concat([pdf, Buffer.alloc(MAX_UPLOAD_BYTES - pdf.length)]),
        ),
      ),
    ).resolves.toBeDefined();
  });
  it.each([
    ['cv.pdf', Buffer.from('not PDF')],
    ['cv.doc', pdf],
    ['cv.docx', doc],
    ['cv.exe', pdf],
    ['cv.pdf', Buffer.alloc(0)],
    ['cv.pdf', Buffer.alloc(MAX_UPLOAD_BYTES + 1)],
    ['cv.doc', doc.subarray(0, 512)],
    ['cv.docx', docx.subarray(0, 100)],
  ])('rejects invalid %s', async (name, buffer) => {
    await expect(
      pipe.transform(file(name, buffer, 'application/pdf')),
    ).rejects.toMatchObject({ status: 400 });
  });
  it.each([0x0100, 0x8000])(
    'rejects encrypted/obfuscated DOC (%s)',
    async (flag) => {
      const archive = CFB.read(doc, { type: 'buffer' });
      const word = CFB.find(archive, 'WordDocument')!;
      const content = Buffer.from(word.content);
      content.writeUInt16LE(content.readUInt16LE(10) | flag, 10);
      word.content = content;
      await expect(
        pipe.transform(
          file('cv.doc', CFB.write(archive, { type: 'buffer' }) as Buffer),
        ),
      ).rejects.toMatchObject({ status: 400 });
    },
  );
  it('rejects legacy Word macros and other OLE files renamed DOC', async () => {
    const archive = CFB.read(doc, { type: 'buffer' });
    CFB.utils.cfb_add(archive, 'Macros/VBA/Module1', Buffer.from('macro'));
    await expect(
      pipe.transform(
        file('cv.doc', CFB.write(archive, { type: 'buffer' }) as Buffer),
      ),
    ).rejects.toMatchObject({ status: 400 });
    CFB.utils.cfb_del(archive, 'WordDocument');
    await expect(
      pipe.transform(
        file('cv.doc', CFB.write(archive, { type: 'buffer' }) as Buffer),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
  it.each(['word/vbaProject.bin', 'word/vbaData.xml'])(
    'rejects DOCX macros: %s',
    async (name) => {
      await expect(
        pipe.transform(
          file(
            'cv.docx',
            zipEdit((archive) => {
              CFB.utils.cfb_add(archive, name, Buffer.from('macro'));
            }),
          ),
        ),
      ).rejects.toMatchObject({ status: 400 });
    },
  );
  it('rejects malformed/DTD XML, non-Word ZIP and macro content types', async () => {
    for (const xml of [
      '<broken>',
      '<!DOCTYPE document [<!ENTITY x SYSTEM "file:///etc/passwd">]><document/>',
      '<document><body/></document>',
    ]) {
      const buffer = zipEdit((archive) => {
        CFB.utils.cfb_add(archive, '[Content_Types].xml', Buffer.from(xml));
      });
      await expect(
        pipe.transform(file('cv.docx', buffer)),
      ).rejects.toMatchObject({ status: 400 });
    }
    const macro = zipEdit((archive) => {
      const types = CFB.find(archive, '[Content_Types].xml')!;
      types.content = Buffer.from(
        Buffer.from(types.content)
          .toString()
          .replace(
            'wordprocessingml.document.main+xml',
            'wordprocessingml.template.macroEnabled.main+xml',
          ),
      );
    });
    await expect(pipe.transform(file('cv.docx', macro))).rejects.toMatchObject({
      status: 400,
    });
  });
  it('rejects encrypted ZIP entries and excessive declared expansion without inflating', async () => {
    for (const encrypted of [true, false]) {
      const modified = Buffer.from(docx);
      const directory = modified.indexOf(Buffer.from('504b0102', 'hex'));
      expect(directory).toBeGreaterThan(0);
      if (encrypted)
        modified.writeUInt16LE(
          modified.readUInt16LE(directory + 8) | 1,
          directory + 8,
        );
      else modified.writeUInt32LE(33 * 1024 * 1024, directory + 24);
      await expect(
        pipe.transform(file('cv.docx', modified)),
      ).rejects.toMatchObject({ status: 400 });
    }
  });
  it('uses unique raw public IDs with the validated lowercase extension', () => {
    const a = cvUploadOptions(file('CV.DOCX', docx));
    const b = cvUploadOptions(file('CV.DOCX', docx));
    expect(a).toMatchObject({
      resource_type: 'raw',
      folder: 'students/cvs',
      overwrite: false,
    });
    expect(a.public_id).toMatch(/^[0-9a-f-]+\.docx$/);
    expect(a.public_id).not.toBe(b.public_id);
  });
});
