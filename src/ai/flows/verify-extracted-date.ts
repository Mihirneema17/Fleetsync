'use server';

/**
 * @fileOverview This flow allows users to verify and correct the expiry date extracted by AI from a document.
 *
 * - verifyExtractedDate - A function that handles the date verification process.
 * - VerifyExtractedDateInput - The input type for the verifyExtractedDate function.
 * - VerifyExtractedDateOutput - The return type for the verifyExtractedDate function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const VerifyExtractedDateInputSchema = z.object({
  documentType: z
    .string()
    .describe("The type of document for which the expiry date is being verified (e.g., 'Insurance', 'Fitness', 'PUC')."),
  documentDataUri: z
    .string()
    .describe(
      "The document, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
  extractedDate: z.string().describe('The expiry date extracted by the AI.'),
});
export type VerifyExtractedDateInput = z.infer<typeof VerifyExtractedDateInputSchema>;

const VerifyExtractedDateOutputSchema = z.object({
  isCorrect: z
    .boolean()
    .describe('Whether the extracted date is correct or not, according to the user.'),
  correctedDate: z
    .string() // Consider using a more specific date format if needed
    .optional()
    .describe('The corrected expiry date, if the extracted date was incorrect.'),
  confirmationNotes: z
    .string()
    .optional()
    .describe('Any notes provided by the user during the verification process.'),
});
export type VerifyExtractedDateOutput = z.infer<typeof VerifyExtractedDateOutputSchema>;

export async function verifyExtractedDate(input: VerifyExtractedDateInput): Promise<VerifyExtractedDateOutput> {
  return verifyExtractedDateFlow(input);
}

const prompt = ai.definePrompt({
  name: 'verifyExtractedDatePrompt',
  input: {schema: VerifyExtractedDateInputSchema},
  output: {schema: VerifyExtractedDateOutputSchema},
  prompt: `You are assisting a user in verifying an expiry date extracted from a document.

  The document type is: {{{documentType}}}
  The extracted expiry date is: {{{extractedDate}}}
  The document is: {{media url=documentDataUri}}

  Ask the user if the extracted date is correct.  If it is not, ask them for the correct date and any notes about why it was incorrect.
  Make sure the user knows to input date in YYYY-MM-DD format.
  Output the results in JSON format according to the schema. isCorrect should be true if the date is correct, and false otherwise.
  If isCorrect is false, then correctedDate must be set and be in YYYY-MM-DD format.
  If isCorrect is false, then confirmationNotes should have the user's notes about why it was incorrect.  If the user doesn't provide notes, then leave confirmationNotes empty.
`,
});

const verifyExtractedDateFlow = ai.defineFlow(
  {
    name: 'verifyExtractedDateFlow',
    inputSchema: VerifyExtractedDateInputSchema,
    outputSchema: VerifyExtractedDateOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
