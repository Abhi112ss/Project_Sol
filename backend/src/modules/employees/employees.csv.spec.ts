import { parseCsvLines } from './employees.module.js';

describe('parseCsvLines', () => {
  it('parses quoted and unquoted CSV employee rows accurately', () => {
    const csv = [
      'email,phone,fullName,employeeCode,department,officeCode,locationName,address,corridorTag,latitude,longitude',
      'nisha@acme.local,+91-9888877777,"Nisha, Rao",EMP-2001,Data Science,HYD-GCB-01,Home - Banjara Hills,"Road No 12, Banjara Hills, Hyderabad",Banjara Hills,17.4126,78.4482',
    ].join('\n');

    const rows = parseCsvLines(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].fullName).toBe('Nisha, Rao');
    expect(rows[0].address).toBe('Road No 12, Banjara Hills, Hyderabad');
    expect(rows[0].latitude).toBe('17.4126');
  });

  it('returns empty array when only header or empty string is provided', () => {
    expect(parseCsvLines('email,phone')).toEqual([]);
    expect(parseCsvLines('')).toEqual([]);
  });
});

