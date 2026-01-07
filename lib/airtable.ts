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

export async function createRSVP(data: {
  firstName: string;
  lastName: string;
  email: string;
  slackId?: string;
  userId: string;
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
        'First Name': data.firstName,
        'Last Name': data.lastName,
        'Email': data.email,
        'Slack ID': data.slackId || '',
        'User ID': data.userId,
        'RSVP Date': new Date().toISOString(),
      },
    },
  ]);
}
