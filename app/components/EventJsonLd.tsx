export default function EventJsonLd() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: 'Stasis',
    description:
      'A High School Hardware Hackathon in Austin, TX. Build hardware projects, earn badges, and qualify for up to $350 in funding.',
    startDate: '2025-05-15',
    endDate: '2025-05-18',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: 'https://schema.org/EventScheduled',
    location: {
      '@type': 'Place',
      name: 'Austin, TX',
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Austin',
        addressRegion: 'TX',
        addressCountry: 'US',
      },
    },
    organizer: {
      '@type': 'Organization',
      name: 'Hack Club',
      url: 'https://hackclub.com',
    },
    url: 'https://stasis.hackclub.com',
    image: 'https://stasis.hackclub.com/og-image.jpg',
    audience: {
      '@type': 'EducationalAudience',
      educationalRole: 'student',
    },
    isAccessibleForFree: true,
    typicalAgeRange: '13-18',
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
