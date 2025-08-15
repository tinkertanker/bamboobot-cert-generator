export const SAMPLE_CERTIFICATE_DATA = `Name	Email	Course	Date	Certificate ID
John Smith	john.smith@example.com	Web Development Bootcamp	December 15, 2024	CERT-2024-001
Sarah Johnson	sarah.j@example.com	Data Science Fundamentals	December 15, 2024	CERT-2024-002
Michael Chen	m.chen@example.com	UI/UX Design Masterclass	December 15, 2024	CERT-2024-003
Emily Davis	emily.davis@example.com	Digital Marketing Pro	December 15, 2024	CERT-2024-004
Robert Wilson	r.wilson@example.com	Cloud Computing Essentials	December 15, 2024	CERT-2024-005`;

export const SAMPLE_WELCOME_MESSAGE = `
Welcome to Bamboobot Certificate Generator! 🎉

To help you get started, we've prepared:
1. A sample certificate template you can use
2. Sample recipient data (shown above)
3. An interactive tour to guide you through the process

Feel free to replace this sample data with your own by:
- Copying data from Excel/Google Sheets
- Pasting it directly in the text area above
- Or clearing everything and starting fresh

Ready to create your first certificate? Let's go!
`;

export const SAMPLE_EMAIL_TEMPLATE = `Dear {{Name}},

Congratulations on successfully completing {{Course}}!

Your certificate is attached to this email. This certificate recognizes your dedication and achievement in completing our program.

Certificate ID: {{Certificate ID}}
Completion Date: {{Date}}

We're proud of your accomplishment and wish you the best in your future endeavors!

Best regards,
The Training Team`;

export const SAMPLE_TEMPLATE_IMAGE_INFO = {
  name: "Modern Certificate Template",
  description: "A clean, professional certificate template suitable for courses, workshops, and training programs",
  downloadUrl: "/api/sample-template"
};