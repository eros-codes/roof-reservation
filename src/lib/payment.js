export function createMockAuthority() {
  return `MOCK-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
}

export function createMockRefId() {
  return `RF-${Math.floor(100000000 + Math.random() * 900000000)}`;
}
