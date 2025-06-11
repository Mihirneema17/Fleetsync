'use server';

/**
 * @fileOverview AI agent that extracts expiry dates from documents.
 *
 * - extractExpiryDate - A function that handles the extraction of expiry dates from documents.
 * - ExtractExpiryDateInput - The input type for the extractExpiryDate function.
 * - ExtractExpiryDateOutput - The return type for the extractExpiryDate function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ExtractExpiryDateInputSchema = z.object({
  documentDataUri: z
    .string()
    .describe(
      "A document (insurance, fitness, or PUC) as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
  documentType: z
    .enum(['insurance', 'fitness', 'puc'])
    .describe('The type of the document.'),
});
export type ExtractExpiryDateInput = z.infer<typeof ExtractExpiryDateInputSchema>;

const ExtractExpiryDateOutputSchema = z.object({
  expiryDate: z
    .string()
    .describe('The extracted expiry date in ISO 8601 format (YYYY-MM-DD).')
    .nullable(),
  confidence: z
    .number()
    .describe('Confidence score (0-1) of the extraction. Null if no date found.')
    .nullable(),
});
export type ExtractExpiryDateOutput = z.infer<typeof ExtractExpiryDateOutputSchema>;

export async function extractExpiryDate(
  input: ExtractExpiryDateInput
): Promise<ExtractExpiryDateOutput> {
  return extractExpiryDateFlow(input);
}

const extractExpiryDatePrompt = ai.definePrompt({
  name: 'extractExpiryDatePrompt',
  input: {schema: ExtractExpiryDateInputSchema},
  output: {schema: ExtractExpiryDateOutputSchema},
  prompt: `You are an AI assistant specialized in extracting expiry dates from documents.

  Given the document type and its content, extract the expiry date. If no expiry date is found, return null for expiryDate and confidence.

  Document Type: {{{documentType}}}
  Document Content: {{media url=documentDataUri}}

  Return the expiry date in ISO 8601 format (YYYY-MM-DD). Also, return a confidence score (0-1) indicating the certainty of the extracted date. If no date is found, both values should be null.
  `,
});

const extractExpiryDateFlow = ai.defineFlow(
  {
    name: 'extractExpiryDateFlow',
    inputSchema: ExtractExpiryDateInputSchema,
    outputSchema: ExtractExpiryDateOutputSchema,
  },
  async input => {
    const {output} = await extractExpiryDatePrompt(input);
    return output!;
  }
);
