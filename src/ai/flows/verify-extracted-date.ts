
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
  extractedDate: z.string().describe('The expiry date extracted by the AI (YYYY-MM-DD format).'),
});
export type VerifyExtractedDateInput = z.infer<typeof VerifyExtractedDateInputSchema>;

const VerifyExtractedDateOutputSchema = z.object({
  isCorrect: z
    .boolean()
    .describe('Whether the extracted date is correct or not, according to the user.'),
  correctedDate: z
    .string() // YYYY-MM-DD format
    .optional()
    .describe('The corrected expiry date (YYYY-MM-DD format), if the extracted date was incorrect.'),
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
  The AI-extracted expiry date is: {{{extractedDate}}}
  The document is: {{media url=documentDataUri}}

  Please ask the user the following:
  1. Is the extracted expiry date '{{{extractedDate}}}' correct for the document (type: {{{documentType}}})?
  2. If it is NOT correct, please provide the correct expiry date in YYYY-MM-DD format.
  3. Optionally, if the date was incorrect, please provide brief notes about why (e.g., "AI missed the renewal date", "Date was for policy start, not end").

  Based on the user's response:
  - Set 'isCorrect' to true if the user confirms the date, false otherwise.
  - If 'isCorrect' is false, 'correctedDate' MUST be set to the user's provided date in YYYY-MM-DD format.
  - If 'isCorrect' is false and the user provides notes, set 'confirmationNotes' to their notes. Otherwise, leave 'confirmationNotes' empty or undefined.

  Ensure your output is in JSON format strictly adhering to the provided schema.
  Example of user providing correction:
  User: "No, the date is wrong. It should be 2025-12-31. The AI picked up the issue date."
  Expected output: {"isCorrect": false, "correctedDate": "2025-12-31", "confirmationNotes": "The AI picked up the issue date."}

  Example of user confirming:
  User: "Yes, that's correct."
  Expected output: {"isCorrect": true}
`,
});

const verifyExtractedDateFlow = ai.defineFlow(
  {
    name: 'verifyExtractedDateFlow',
    inputSchema: VerifyExtractedDateInputSchema,
    outputSchema: VerifyExtractedDateOutputSchema,
  },
  async input => {
    // In a real scenario, this flow would likely be part of a larger interactive session (e.g. chat).
    // For this standalone definition, we assume the input to the prompt will trigger the LLM to generate
    // the JSON output based on a *hypothetical* user interaction matching the prompt's instructions.
    const {output} = await prompt(input);
    return output!;
  }
);

