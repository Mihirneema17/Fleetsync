
'use server';
/**
 * @fileOverview AI agent that extracts vehicle registration number, document type,
 * policy number, start date, and expiry date from a given document.
 *
 * - smartIngestDocument - A function that handles the smart document ingestion.
 * - SmartIngestInput - The input type for the smartIngestDocument function.
 * - SmartIngestOutput - The return type for the smartIngestDocument function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { DOCUMENT_TYPES } from '@/lib/constants'; // Import for enum

// Filter out 'Other' as AI should suggest it, not be forced into it from a limited enum for suggestion.
const SuggestableDocumentTypes = DOCUMENT_TYPES.filter(type => type !== 'Other');

const SmartIngestInputSchema = z.object({
  documentDataUri: z
    .string()
    .describe(
      "A document (e.g., insurance policy, fitness certificate, PUC, AITP) as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type SmartIngestInput = z.infer<typeof SmartIngestInputSchema>;

const SmartIngestOutputSchema = z.object({
  vehicleRegistrationNumber: z
    .string()
    .nullable()
    .describe('The extracted vehicle registration number (e.g., MH12AB1234). Null if not found.'),
  vehicleRegistrationNumberConfidence: z
    .number()
    .min(0)
    .max(1)
    .nullable()
    .describe('Confidence score (0-1) for the vehicle registration number extraction. Null if not found.'),

  documentTypeSuggestion: z
    .enum([...SuggestableDocumentTypes, 'Other', 'Unknown'] as [string, ...string[]])
    .nullable()
    .describe(`Suggested document type from the list [${SuggestableDocumentTypes.join(', ')}, Other, Unknown]. Null if not determinable.`),
  documentTypeConfidence: z
    .number()
    .min(0)
    .max(1)
    .nullable()
    .describe('Confidence score (0-1) for the document type suggestion. Null if not determinable.'),
  customTypeNameSuggestion: z
    .string()
    .nullable()
    .describe("Suggested custom name if documentTypeSuggestion is 'Other' or 'Unknown'. Null otherwise or if not applicable."),

  policyNumber: z
    .string()
    .nullable()
    .describe('The extracted policy or document number. Null if not found.'),
  policyNumberConfidence: z
    .number()
    .min(0)
    .max(1)
    .nullable()
    .describe('Confidence score (0-1) for the policy number extraction. Null if not found or not applicable.'),

  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Date must be in YYYY-MM-DD format" })
    .nullable()
    .describe('The extracted start date of the document validity in YYYY-MM-DD format. Null if not found.'),
  startDateConfidence: z
    .number()
    .min(0)
    .max(1)
    .nullable()
    .describe('Confidence score (0-1) for the start date extraction. Null if not found or not applicable.'),

  expiryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Date must be in YYYY-MM-DD format" })
    .nullable()
    .describe('The extracted expiry date (end date of validity) in YYYY-MM-DD format. Null if not found.'),
  expiryDateConfidence: z
    .number()
    .min(0)
    .max(1)
    .nullable()
    .describe('Confidence score (0-1) for the expiry date extraction. Null if no date found.'),
});
export type SmartIngestOutput = z.infer<typeof SmartIngestOutputSchema>;

export async function smartIngestDocument(
  input: SmartIngestInput
): Promise<SmartIngestOutput> {
  return smartIngestFlow(input);
}

const smartIngestDocumentPrompt = ai.definePrompt({
  name: 'smartIngestDocumentPrompt',
  input: {schema: SmartIngestInputSchema},
  output: {schema: SmartIngestOutputSchema},
  prompt: `You are an AI assistant specialized in extracting specific information from vehicle-related documents.
  The typical documents are Insurance policies, Fitness certificates, PUC (Pollution Under Control) certificates, or AITP (All India Tourist Permit) documents.

  Given the document content, extract the following information. For each piece of information, provide a confidence score (0-1) indicating your certainty.
  If any piece of information is not found, not applicable, or you are unsure, return null for that field and its confidence score.

  1.  **Vehicle Registration Number**: The vehicle's license plate number (e.g., MH12AB1234, DL1CAX0001).
  2.  **Document Type Suggestion**: Classify the document. It should be one of [${SuggestableDocumentTypes.join(', ')}]. If it doesn't clearly fit, suggest 'Other'. If completely unidentifiable as a relevant vehicle document, suggest 'Unknown'.
  3.  **Custom Type Name Suggestion**: If you suggest 'Other' or 'Unknown' for documentTypeSuggestion, provide a brief descriptive name for the document type based on its content (e.g., "Road Tax Receipt", "Special Permit"). Otherwise, set to null.
  4.  **Policy Number or Document Number**: The primary identification number of the document.
  5.  **Start Date**: The date from which the document is valid, in YYYY-MM-DD format.
  6.  **Expiry Date**: The date on which the document validity ends, in YYYY-MM-DD format.

  Document Content: {{media url=documentDataUri}}

  Prioritize accuracy. If a vehicle registration number appears multiple times, pick the most prominent one.
  Return all dates strictly in YYYY-MM-DD format. If a date is present but in a different format, convert it. If conversion is not possible with high confidence, return null for the date.
  Strictly adhere to the JSON output schema provided.

  Example Output:
  {
    "vehicleRegistrationNumber": "MH14FU1234",
    "vehicleRegistrationNumberConfidence": 0.98,
    "documentTypeSuggestion": "Insurance",
    "documentTypeConfidence": 0.95,
    "customTypeNameSuggestion": null,
    "policyNumber": "P123456789",
    "policyNumberConfidence": 0.92,
    "startDate": "2023-05-01",
    "startDateConfidence": 0.90,
    "expiryDate": "2024-04-30",
    "expiryDateConfidence": 0.99
  }

  Another Example (for a less common document):
  {
    "vehicleRegistrationNumber": "KA01EZ5555",
    "vehicleRegistrationNumberConfidence": 0.90,
    "documentTypeSuggestion": "Other",
    "documentTypeConfidence": 0.75,
    "customTypeNameSuggestion": "National Permit Fine Receipt",
    "policyNumber": "RCPT00123",
    "policyNumberConfidence": 0.80,
    "startDate": null,
    "startDateConfidence": null,
    "expiryDate": null, // Fine receipts might not have expiry dates
    "expiryDateConfidence": null
  }
  `,
});

const smartIngestFlow = ai.defineFlow(
  {
    name: 'smartIngestFlow',
    inputSchema: SmartIngestInputSchema,
    outputSchema: SmartIngestOutputSchema,
  },
  async input => {
    const {output} = await smartIngestDocumentPrompt(input);
    return output!;
  }
);
