import Airtable from 'airtable';

function getAirtableBase() {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;

  if (!apiKey || !baseId) {
    return null;
  }

  const airtable = new Airtable({ apiKey });
  return airtable.base(baseId);
}

export async function markAccountCreationFinished(email: string): Promise<boolean> {
  const base = getAirtableBase();

  if (!base) {
    console.warn('Airtable credentials not configured, skipping update');
    return false;
  }

  const tableName = process.env.AIRTABLE_TABLE_NAME || 'RSVPs';

  const records = await base(tableName)
    .select({
      filterByFormula: `{Email} = '${email}'`,
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
}) {
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

  if (data.referredBy) {
    fields['Referred By'] = Number(data.referredBy);
  }

  return base(tableName).create([{ fields }]);
}

export async function findRSVPByEmail(email: string): Promise<boolean> {
  const base = getAirtableBase();

  if (!base) {
    return false;
  }

  const tableName = process.env.AIRTABLE_TABLE_NAME || 'RSVPs';

  const records = await base(tableName)
    .select({
      filterByFormula: `{Email} = '${email}'`,
      maxRecords: 1,
    })
    .firstPage();

  return records.length > 0;
}

export async function ensureRSVPExists(email: string, name?: string): Promise<void> {
  const base = getAirtableBase();
  if (!base) return;

  const tableName = process.env.AIRTABLE_TABLE_NAME || 'RSVPs';
  
  const nameParts = (name || '').trim().split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  const records = await base(tableName)
    .select({
      filterByFormula: `{Email} = '${email}'`,
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
        },
      },
    ]);
  }
}

export async function updateRSVPName(email: string, fullName: string): Promise<boolean> {
  const base = getAirtableBase();

  if (!base) {
    console.warn('Airtable credentials not configured, skipping name update');
    return false;
  }

  const tableName = process.env.AIRTABLE_TABLE_NAME || 'RSVPs';

  const records = await base(tableName)
    .select({
      filterByFormula: `{Email} = '${email}'`,
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


