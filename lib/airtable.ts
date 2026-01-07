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
  firstName: string;
  lastName: string;
  email: string;
  ip?: string;
}) {
  const base = getAirtableBase();

  if (!base) {
    console.warn('Airtable credentials not configured, skipping RSVP submission');
    return null;
  }

  const tableName = process.env.AIRTABLE_TABLE_NAME || 'RSVPs';

  return base(tableName).create([
    {
      fields: {
        'Email': data.email,
        'First Name': data.firstName,
        'Last Name': data.lastName,
        'IP': data.ip || '',
      },
    },
  ]);
}
