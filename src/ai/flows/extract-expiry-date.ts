
'use server';

/**
 * @fileOverview AI agent that extracts expiry dates, start dates, and policy numbers from documents.
 *
 * - extractExpiryDate - A function that handles the extraction.
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
  policyNumber: z
    .string()
    .nullable()
    .describe('The extracted policy or document number. Null if not found.'),
  policyNumberConfidence: z
    .number()
    .nullable()
    .describe('Confidence score (0-1) for the policy number extraction. Null if not found or not applicable.'),
  startDate: z
    .string()
    .nullable()
    .describe('The extracted start date of the document validity in ISO 8601 format (YYYY-MM-DD). Null if not found.'),
  startDateConfidence: z
    .number()
    .nullable()
    .describe('Confidence score (0-1) for the start date extraction. Null if not found or not applicable.'),
  expiryDate: z
    .string()
    .nullable()
    .describe('The extracted expiry date (end date of validity) in ISO 8601 format (YYYY-MM-DD). Null if not found.'),
  confidence: z // This confidence is for expiryDate
    .number()
    .nullable()
    .describe('Confidence score (0-1) of the expiry date extraction. Null if no date found.'),
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
  prompt: `You are an AI assistant specialized in extracting information from documents such as insurance policies, fitness certificates, or PUC certificates.

  Given the document type and its content, extract the following information:
  1. Policy Number or Document Number: The primary identification number of the document.
  2. Start Date: The date from which the document is valid, in YYYY-MM-DD format.
  3. Expiry Date: The date on which the document validity ends, in YYYY-MM-DD format.

  If any piece of information is not found or not applicable, return null for that field and its corresponding confidence score.
  For each extracted piece of information (policy number, start date, expiry date), provide a confidence score (0-1) indicating the certainty of the extraction.

  Document Type: {{{documentType}}}
  Document Content: {{media url=documentDataUri}}

  Return all dates in ISO 8601 format (YYYY-MM-DD).
  Strictly adhere to the JSON output schema.
  Example output:
  {
    "policyNumber": "ABC123456XYZ",
    "policyNumberConfidence": 0.95,
    "startDate": "2023-01-15",
    "startDateConfidence": 0.92,
    "expiryDate": "2024-01-14",
    "confidence": 0.98
  }
  If a policy number is not applicable or found for a PUC or Fitness certificate, set policyNumber and policyNumberConfidence to null.
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
