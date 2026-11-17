import crypto from 'node:crypto';

const COMMON = ['password', 'qwerty', '123456', 'abcdef', 'letmein', 'welcome', 'admin123', 'iloveyou'];

// Returns a message if the password is not acceptable, otherwise null
export function passwordProblem(password, { email = '', name = '' } = {}) {
  if (typeof password !== 'string' || password.length < 10) return 'Use at least 10 characters';
  if (password.length > 128) return 'Use 128 characters or fewer';
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return 'Include both letters and numbers';
  const lower = password.toLowerCase();
  if (COMMON.some((c) => lower.includes(c))) return 'That password is too common. Choose something less guessable';
  const local = email.split('@')[0].toLowerCase();
  if (local.length >= 4 && lower.includes(local)) return 'The password should not contain the email name';
  const first = name.trim().split(/\s+/)[0]?.toLowerCase() || '';
  if (first.length >= 4 && lower.includes(first)) return 'The password should not contain the person\'s name';
  return null;
}

// A readable temporary password: 12 characters, no look-alikes (no 0/O, 1/l/I)
export function generateTempPassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const all = upper + lower + digits;
  const pick = (set) => set[crypto.randomInt(set.length)];
  const chars = [pick(upper), pick(lower), pick(digits), pick(digits)];
  while (chars.length < 12) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
