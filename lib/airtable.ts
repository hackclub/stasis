import Airtable from 'airtable';
import prisma from './prisma';
import { fetchHackatimeProjectSeconds } from './hackatime';
import { getTierById } from './tiers';
import { STARTER_PROJECT_NAMES } from './starter-projects';

function isPostgresMode(): boolean {
  return process.env.RSVP_USE_POSTGRES === 'true';
}

function escapeAirtableValue(value: string): string {
  // Strip control characters, then escape backslashes and single quotes
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
  if (isPostgresMode()) {
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
  if (isPostgresMode()) {
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
  if (isPostgresMode()) {
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
  if (isPostgresMode()) {
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
  if (isPostgresMode()) {
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

export function goalPreferenceToDisplayName(goal: string): string {
  if (goal === 'opensauce') return 'Open Sauce';
  if (goal === 'prizes') return 'Prizes';
  return 'Stasis';
}

export async function updateTargetGoal(email: string, goal: string): Promise<boolean> {
  const displayName = goalPreferenceToDisplayName(goal);

  if (isPostgresMode()) {
    // No target goal field in TempRsvp — will be synced to Airtable later
    return true;
  }

  const base = getAirtableBase();
  if (!base) {
    console.warn('Airtable credentials not configured, skipping target goal update');
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
  hoursJustification: string | null;
  complexityTier: string | null;
  stasisId: string | null;
  slackId: string | null;
  guide: string | null;
  stage: 'Design' | 'Build';
}): Promise<void> {
  const base = getAirtableBase();
  if (!base) {
    console.warn('Airtable credentials not configured, skipping YSWS project submission');
    return;
  }

  const tableName = process.env.AIRTABLE_YSWS_TABLE_NAME || 'YSWS Project Submission';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fields: Record<string, any> = {
    'First Name': data.firstName || '',
    'Last Name': data.lastName || '',
    'Email': data.email,
    'Code URL': data.githubUrl || '',
    'Playable URL': data.githubUrl || '',
    'Description': data.description || '',
    'Address (Line 1)': data.addressLine1 || '',
    'Address (Line 2)': data.addressLine2 || '',
    'City': data.city || '',
    'State / Province': data.state || '',
    'Country': data.country || '',
    'ZIP / Postal Code': data.zip || '',
    'Birthday': data.birthday || '',
    'Optional - Override Hours Spent': data.totalHours,
    ...(data.hoursJustification != null ? { 'Optional - Override Hours Spent Justification': data.hoursJustification } : {}),
    'Requested Grant Amount': data.grantAmount ?? 0,
    'Complexity Tier': data.complexityTier || '',
    'Stasis ID': data.stasisId || '',
    'Slack ID': data.slackId || '',
    'guide': data.guide || '',
    'Stage': data.stage,
  };

  if (data.bannerUrl) fields['Screenshot'] = [{ url: data.bannerUrl }];

  // Check for existing record by Stasis ID to avoid duplicates
  if (data.stasisId) {
    const existing = await base(tableName)
      .select({
        filterByFormula: `AND({Stasis ID} = '${data.stasisId.replace(/'/g, "\\'")}', {Stage} = '${data.stage}')`,
        maxRecords: 1,
      })
      .firstPage();

    if (existing.length > 0) {
      await base(tableName).update(existing[0].id, fields);
      return;
    }
  }

  await base(tableName).create([{ fields }]);
}

export async function syncProjectToAirtable(
  userId: string,
  project: { id: string; tier?: number | null; githubRepo: string | null; description: string | null; coverImage: string | null; starterProjectId?: string | null; workSessions: { hoursClaimed: number; stage?: string }[] },
  hoursJustification?: string,
  airtableGrantAmount?: number | null,
  options?: { buildOnly?: boolean; approvedHours?: number },
): Promise<void> {
  const { decryptPII } = await import('./pii');

  const safeDecrypt = (fieldName: string, val: string | null | undefined) => {
    if (!val) return null;
    try { return decryptPII(val); } catch (err) {
      console.warn(`Failed to decrypt PII field "${fieldName}" for user ${userId}:`, err);
      return null;
    }
  };

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');

  // Look up the grant amount from the design approval review action (fallback for manual sync)
  const designAction = await prisma.projectReviewAction.findFirst({
    where: { projectId: project.id, stage: 'DESIGN', decision: 'APPROVED' },
    orderBy: { createdAt: 'desc' },
    select: { grantAmount: true },
  });
  const grantAmount = airtableGrantAmount !== undefined ? airtableGrantAmount : (designAction?.grantAmount ?? null);

  const nameParts = (user.name || '').trim().split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';
  const filteredSessions = options?.buildOnly
    ? project.workSessions.filter((s) => s.stage === 'BUILD')
    : project.workSessions;
  const workSessionHours = filteredSessions.reduce((sum, s) => sum + s.hoursClaimed, 0);

  // Sum firmware time from linked hackatime projects,
  // preferring admin-reviewed hoursApproved over raw API hours
  let firmwareHours = 0;
  const hackatimeLinks = await prisma.hackatimeProject.findMany({
    where: { projectId: project.id },
  });
  if (hackatimeLinks.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hackatimeUserId = (user as any).hackatimeUserId as string | null;
    const results = await Promise.all(
      hackatimeLinks.map(async (hp) => {
        if (hp.hoursApproved !== null) return hp.hoursApproved;
        if (!hackatimeUserId) return 0;
        const totalSeconds = await fetchHackatimeProjectSeconds(hackatimeUserId, hp.hackatimeProject);
        return totalSeconds / 3600;
      })
    );
    firmwareHours = results.reduce((sum, h) => sum + h, 0);
  }

  const totalHours = options?.approvedHours != null ? options.approvedHours : (workSessionHours + firmwareHours);

  await submitYSWSProjectSubmission({
    githubUrl: project.githubRepo,
    firstName,
    lastName,
    email: user.email,
    description: project.description,
    bannerUrl: project.coverImage,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addressLine1: safeDecrypt('addressStreet', (user as any).encryptedAddressStreet),
    addressLine2: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    city: safeDecrypt('addressCity', (user as any).encryptedAddressCity),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    state: safeDecrypt('addressState', (user as any).encryptedAddressState),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    country: safeDecrypt('addressCountry', (user as any).encryptedAddressCountry),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    zip: safeDecrypt('addressZip', (user as any).encryptedAddressZip),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    birthday: safeDecrypt('birthday', (user as any).encryptedBirthday),
    totalHours,
    grantAmount,
    hoursJustification: hoursJustification ?? null,
    complexityTier: project.tier != null ? (getTierById(project.tier)?.name ?? null) : null,
    stasisId: project.id,
    slackId: user.slackId ?? null,
    guide: project.starterProjectId ? (STARTER_PROJECT_NAMES[project.starterProjectId] ?? project.starterProjectId) : null,
    stage: options?.buildOnly ? 'Build' : 'Design',
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


