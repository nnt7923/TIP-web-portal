/** Compare-and-swap refresh token; không hồi sinh session đã logout. */
export const SAVE_SESSION = `
if ARGV[5] ~= '' then
  local owner = redis.call('HGET', KEYS[1], 'accountId') or redis.call('HGET', KEYS[1], 'userId')
  if owner ~= ARGV[1] then return 0 end
  if redis.call('HGET', KEYS[1], 'refreshJti') ~= ARGV[5] then
    local cached = redis.call('GET', KEYS[3])
    if cached then
      local result = cjson.decode(cached)
      if redis.call('HGET', KEYS[1], 'refreshJti') == result.refreshJti then return cached end
    end
    return 0
  end
end
redis.call('HSET', KEYS[1], 'accountId', ARGV[1], 'refreshJti', ARGV[2])
redis.call('EXPIRE', KEYS[1], ARGV[3])
redis.call('SADD', KEYS[2], ARGV[4])
if redis.call('TTL', KEYS[2]) < tonumber(ARGV[3]) then redis.call('EXPIRE', KEYS[2], ARGV[3]) end
if ARGV[5] ~= '' then redis.call('SET', KEYS[3], ARGV[6], 'EX', 5) end
return 1
`;

/** Xóa tập session và mọi session thành viên trong một thao tác Redis. */
export const REMOVE_ALL_SESSIONS = `
local sessions = redis.call('SMEMBERS', KEYS[1])
for _, sid in ipairs(sessions) do redis.call('DEL', ARGV[1] .. sid) end
redis.call('DEL', KEYS[1])
return #sessions
`;

/** OTP hết hiệu lực sau 5 lần sai; bộ đếm có cùng TTL với OTP. */
export const CONSUME_OTP = `
local value = redis.call('GET', KEYS[1])
if not value then return 0 end
if value ~= ARGV[1] then
  local attempts = redis.call('INCR', KEYS[2])
  if attempts == 1 then redis.call('EXPIRE', KEYS[2], math.max(redis.call('TTL', KEYS[1]), 1)) end
  if attempts >= tonumber(ARGV[2]) then redis.call('DEL', KEYS[1]) end
  return 0
end
redis.call('DEL', KEYS[1], KEYS[2])
return 1
`;

export const RATE_LIMIT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return count
`;
