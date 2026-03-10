import Airtable from 'airtable';
import prisma from './prisma';

function usePostgres(): boolean {
  return process.env.RSVP_USE_POSTGRES === 'true';
}

function escapeAirtableValue(value: string): string {
  // Strip control characters, then escape backslashes and single quotes
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\x00-\x1F\x7F]/g, '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function getAirtableBase() {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;

  if (!apiKey || !baseId) {
    return null;
  }

  const airtable = new Airtable({ apiKey });
  return airtable.base(baseId);
}

function getAirtableBaseOrThrow() {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!apiKey || !baseId) throw new Error('Airtable credentials not configured');
  return new Airtable({ apiKey }).base(baseId);
}

// Direct Airtable calls that bypass RSVP_USE_POSTGRES — used during sync operations.

export async function airtableFindByEmail(email: string): Promise<boolean> {
  const base = getAirtableBaseOrThrow();
  const tableName = process.env.AIRTABLE_TABLE_NAME || 'RSVPs';
  const records = await base(tableName)
    .select({ filterByFormula: `{Email} = '${escapeAirtableValue(email)}'`, maxRecords: 1 })
    .firstPage();
  return records.length > 0;
}

export async function airtableCreateRSVP(data: {
  email: string;
  ip?: string;
  referralType?: string | null;
  referredBy?: string | null;
  signupPage?: string | null;
}): Promise<void> {
  const base = getAirtableBaseOrThrow();
  const tableName = process.env.AIRTABLE_TABLE_NAME || 'RSVPs';
  const fields: Record<string, string | number> = { Email: data.email, IP: data.ip || '' };
  if (data.referralType) fields['UTM Source'] = data.referralType;
  const referredByNum = Number(data.referredBy);
  if (data.referredBy && isFinite(referredByNum)) fields['Referred By'] = referredByNum;
  const signupPageValue = data.signupPage || 'Stasis';
  fields['Loops - stasisSignUpPage'] = signupPageValue;
  fields['Loops - stasisTargetEvent'] = signupPageValue;
  await base(tableName).create([{ fields }]);
}

export async function airtableEnsureRSVPExists(email: string, name: string): Promise<void> {
  const base = getAirtableBaseOrThrow();
  const tableName = process.env.AIRTABLE_TABLE_NAME || 'RSVPs';
  const nameParts = name.trim().split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  const records = await base(tableName)
    .select({ filterByFormula: `{Email} = '${escapeAirtableValue(email)}'`, maxRecords: 1 })
    .firstPage();

  if (records.length > 0) {
    await base(tableName).update(records[0].id, {
      'First Name': firstName,
      'Last Name': lastName,
      'Finished Account Creation': true,
    });
  } else {
    await base(tableName).create([{
      fields: { Email: email, 'First Name': firstName, 'Last Name': lastName, 'Finished Account Creation': true, 'Loops - stasisSignUpPage': 'Direct', 'Loops - stasisTargetEvent': 'Stasis' },
    }]);
  }
}

export async function markAccountCreationFinished(email: string): Promise<boolean> {
  if (usePostgres()) {
    const rsvp = await prisma.tempRsvp.findUnique({ where: { email } });
    if (!rsvp) return false;
    await prisma.tempRsvp.update({ where: { email }, data: { finishedAccount: true } });
    return true;
  }

  const base = getAirtableBase();

  if (!base) {
    console.warn('Airtable credentials not configured, skipping update');
    return false;
  }

  const tableName = process.env.AIRTABLE_TABLE_NAME || 'RSVPs';

  const records = await base(tableName)
    .select({
      filterByFormula: `{Email} = '${escapeAirtableValue(email)}'`,
      maxRecords: 1,
    })
    .firstPage();

  if (records.length === 0) {
    return false;
  }

  await base(tableName).update(records[0].id, {
    'Finished Account Creation': true,
  });

  return true;
}

export async function createRSVP(data: {
  email: string;
  ip?: string;
  referralType?: string | null;
  referredBy?: string | null;
  signupPage?: string | null;
}) {
  if (usePostgres()) {
    await prisma.tempRsvp.create({
      data: {
        email: data.email,
        ip: data.ip || null,
        utmSource: data.referralType || null,
        referredBy: data.referredBy && isFinite(Number(data.referredBy)) ? data.referredBy : null,
      },
    });
    return { referralCode: null };
  }

  const base = getAirtableBase();

  if (!base) {
    console.warn('Airtable credentials not configured, skipping RSVP submission');
    return null;
  }

  const tableName = process.env.AIRTABLE_TABLE_NAME || 'RSVPs';

  const fields: Record<string, string | number> = {
    'Email': data.email,
    'IP': data.ip || '',
  };

  if (data.referralType) {
    fields['UTM Source'] = data.referralType;
  }

  const referredByNum = Number(data.referredBy);
  if (data.referredBy && isFinite(referredByNum)) {
    fields['Referred By'] = referredByNum;
  }

  const signupPageValue = data.signupPage || 'Stasis';
  fields['Loops - stasisSignUpPage'] = signupPageValue;
  fields['Loops - stasisTargetEvent'] = signupPageValue;

  const result = await base(tableName).create([{ fields }]);
  const record = result[0];
  const referralCode = record.get('Loops - stasisReferralCode') as number | undefined;
  return { referralCode: referralCode ?? null };
}

export async function findRSVPByEmail(email: string): Promise<boolean> {
  if (usePostgres()) {
    const rsvp = await prisma.tempRsvp.findUnique({ where: { email } });
    return !!rsvp;
  }

  const base = getAirtableBase();

  if (!base) {
    return false;
  }

  const tableName = process.env.AIRTABLE_TABLE_NAME || 'RSVPs';

  const records = await base(tableName)
    .select({
      filterByFormula: `{Email} = '${escapeAirtableValue(email)}'`,
      maxRecords: 1,
    })
    .firstPage();

  return records.length > 0;
}

export async function ensureRSVPExists(email: string, name?: string): Promise<void> {
  if (usePostgres()) {
    const nameParts = (name || '').trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    await prisma.tempRsvp.upsert({
      where: { email },
      update: { firstName, lastName, finishedAccount: true },
      create: { email, firstName, lastName, finishedAccount: true },
    });
    return;
  }

  const base = getAirtableBase();
  if (!base) return;

  const tableName = process.env.AIRTABLE_TABLE_NAME || 'RSVPs';
  
  const nameParts = (name || '').trim().split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  const records = await base(tableName)
    .select({
      filterByFormula: `{Email} = '${escapeAirtableValue(email)}'`,
      maxRecords: 1,
    })
    .firstPage();

  if (records.length > 0) {
    await base(tableName).update(records[0].id, {
      'First Name': firstName,
      'Last Name': lastName,
      'Finished Account Creation': true,
    });
  } else {
    await base(tableName).create([
      {
        fields: {
          'Email': email,
          'First Name': firstName,
          'Last Name': lastName,
          'Finished Account Creation': true,
          'Loops - stasisSignUpPage': 'Direct',
          'Loops - stasisTargetEvent': 'Stasis',
        },
      },
    ]);
  }
}

export async function updateRSVPName(email: string, fullName: string): Promise<boolean> {
  if (usePostgres()) {
    const rsvp = await prisma.tempRsvp.findUnique({ where: { email } });
    if (!rsvp) return false;
    const nameParts = fullName.trim().split(/\s+/);
    await prisma.tempRsvp.update({
      where: { email },
      data: { firstName: nameParts[0] || '', lastName: nameParts.slice(1).join(' ') || '' },
    });
    return true;
  }

  const base = getAirtableBase();

  if (!base) {
    console.warn('Airtable credentials not configured, skipping name update');
    return false;
  }

  const tableName = process.env.AIRTABLE_TABLE_NAME || 'RSVPs';

  const records = await base(tableName)
    .select({
      filterByFormula: `{Email} = '${escapeAirtableValue(email)}'`,
      maxRecords: 1,
    })
    .firstPage();

  if (records.length === 0) {
    return false;
  }

  const nameParts = fullName.trim().split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  await base(tableName).update(records[0].id, {
    'First Name': firstName,
    'Last Name': lastName,
  });

  return true;
}

export async function getReferrerByNumber(referrerNumber: number): Promise<{
  email: string;
  totalReferrals: number;
} | null> {
  if (!Number.isFinite(referrerNumber) || referrerNumber < 0) return null;

  const base = getAirtableBase();
  if (!base) return null;

  const tableName = process.env.AIRTABLE_TABLE_NAME || 'RSVPs';

  const records = await base(tableName)
    .select({
      filterByFormula: `{Loops - stasisReferralCode} = ${referrerNumber}`,
      fields: ['Email', 'Total Referrals'],
      maxRecords: 1,
    })
    .firstPage();

  if (records.length === 0) return null;

  const record = records[0];
  return {
    email: record.get('Email') as string,
    totalReferrals: (record.get('Total Referrals') as number) || 0,
  };
}

export function eventPreferenceToDisplayName(event: string): string {
  return event === 'opensauce' ? 'Open Sauce' : 'Stasis';
}

export async function updateTargetEvent(email: string, event: string): Promise<boolean> {
  const displayName = eventPreferenceToDisplayName(event);

  if (usePostgres()) {
    // No target event field in TempRsvp — will be synced to Airtable later
    return true;
  }

  const base = getAirtableBase();
  if (!base) {
    console.warn('Airtable credentials not configured, skipping target event update');
    return false;
  }

  const tableName = process.env.AIRTABLE_TABLE_NAME || 'RSVPs';

  const records = await base(tableName)
    .select({
      filterByFormula: `{Email} = '${escapeAirtableValue(email)}'`,
      maxRecords: 1,
    })
    .firstPage();

  if (records.length === 0) {
    return false;
  }

  await base(tableName).update(records[0].id, {
    'Loops - stasisTargetEvent': displayName,
  });

  return true;
}

export async function getRSVPCount(): Promise<number> {
  const base = getAirtableBase();

  if (!base) {
    return 0;
  }

  const tableName = process.env.AIRTABLE_TABLE_NAME || 'RSVPs';

  let count = 0;
  await base(tableName)
    .select({
      fields: ['Email'],
    })
    .eachPage((records, fetchNextPage) => {
      count += records.length;
      fetchNextPage();
    });

  return count;
}

export async function submitYSWSProjectSubmission(data: {
  githubUrl: string | null;
  firstName: string;
  lastName: string;
  email: string;
  description: string | null;
  bannerUrl: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  zip: string | null;
  birthday: string | null;
  totalHours: number;
  grantAmount: number | null;
}): Promise<void> {
  const base = getAirtableBase();
  if (!base) {
    console.warn('Airtable credentials not configured, skipping YSWS project submission');
    return;
  }

  const tableName = process.env.AIRTABLE_YSWS_TABLE_NAME || 'YSWS Project Submission';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fields: Record<string, any> = {
    'First Name': data.firstName,
    'Last Name': data.lastName,
    'Email': data.email,
  };

  if (data.githubUrl) {
    fields['Code URL'] = data.githubUrl;
    fields['Playable URL'] = data.githubUrl;
  }
  if (data.description) fields['Description'] = data.description;
  if (data.bannerUrl) fields['Screenshot'] = [{ url: data.bannerUrl }];
  if (data.addressLine1) fields['Address (Line 1)'] = data.addressLine1;
  if (data.addressLine2) fields['Address (Line 2)'] = data.addressLine2;
  if (data.city) fields['City'] = data.city;
  if (data.state) fields['State / Province'] = data.state;
  if (data.country) fields['Country'] = data.country;
  if (data.zip) fields['ZIP / Postal Code'] = data.zip;
  if (data.birthday) fields['Birthday'] = data.birthday;
  if (data.totalHours > 0) fields['Optional - Override Hours Spent'] = data.totalHours;
  if (data.grantAmount !== null && data.grantAmount > 0) fields['Requested Grant Amount'] = data.grantAmount;

  await base(tableName).create([{ fields }]);
}

export async function syncProjectToAirtable(
  userId: string,
  project: { id: string; githubRepo: string | null; description: string | null; coverImage: string | null; workSessions: { hoursClaimed: number }[] },
): Promise<void> {
  const { decryptPII } = await import('./pii');

  const safeDecrypt = (val: string | null | undefined) => {
    if (!val) return null;
    try { return decryptPII(val); } catch { return null; }
  };

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');

  // Look up the grant amount from the design approval review action
  const designAction = await prisma.projectReviewAction.findFirst({
    where: { projectId: project.id, stage: 'DESIGN', decision: 'APPROVED' },
    orderBy: { createdAt: 'desc' },
    select: { grantAmount: true },
  });
  const grantAmount = designAction?.grantAmount ?? null;

  const nameParts = (user.name || '').trim().split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';
  const totalHours = project.workSessions.reduce((sum, s) => sum + s.hoursClaimed, 0);

  await submitYSWSProjectSubmission({
    githubUrl: project.githubRepo,
    firstName,
    lastName,
    email: user.email,
    description: project.description,
    bannerUrl: project.coverImage,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addressLine1: safeDecrypt((user as any).encryptedAddressStreet),
    addressLine2: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    city: safeDecrypt((user as any).encryptedAddressCity),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    state: safeDecrypt((user as any).encryptedAddressState),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    country: safeDecrypt((user as any).encryptedAddressCountry),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    zip: safeDecrypt((user as any).encryptedAddressZip),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    birthday: safeDecrypt((user as any).encryptedBirthday),
    totalHours,
    grantAmount,
  });
}

export async function getRSVPCountLast24Hours(): Promise<number> {
  const base = getAirtableBase();

  if (!base) {
    return 0;
  }

  const tableName = process.env.AIRTABLE_TABLE_NAME || 'RSVPs';

  let count = 0;
  await base(tableName)
    .select({
      fields: ['Email'],
      filterByFormula: "IS_AFTER(CREATED_TIME(), DATEADD(NOW(), -24, 'hours'))",
    })
    .eachPage((records, fetchNextPage) => {
      count += records.length;
      fetchNextPage();
    });

  return count;
}


