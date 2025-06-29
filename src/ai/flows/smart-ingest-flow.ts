
'use server';
/**
 * @fileOverview AI agent that extracts vehicle registration number, document type,
 * policy number, start date, expiry date, and vehicle details (make, model, type) from a given document.
 *
 * - smartIngestDocument - A function that handles the smart document ingestion.
 * - SmartIngestInput - The input type for the smartIngestDocument function.
 * - SmartIngestOutput - The return type for the smartIngestDocument function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { DOCUMENT_TYPES, VEHICLE_TYPES } from '@/lib/constants'; // Import for enum & vehicle types

// Filter out 'Other' as AI should suggest it, not be forced into it from a limited enum for suggestion.
const SuggestableDocumentTypes = DOCUMENT_TYPES.filter(type => type !== 'Other');

const SmartIngestInputSchema = z.object({
  documentDataUri: z
    .string()
    .describe(
      "A document (e.g., insurance policy, fitness certificate, PUC, AITP, vehicle registration card) as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
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
    .describe(`Suggested document type from the list [${SuggestableDocumentTypes.join(', ')}, Other, Unknown]. Null if not determinable. This is for the type of *document* (e.g. Insurance, RegistrationCard).`),
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
    .describe('The extracted policy or document number (relevant for Insurance, PUC etc.). Null if not found or not applicable for a registration card.'),
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

  // New fields for vehicle details
  vehicleMakeSuggestion: z
    .string()
    .nullable()
    .describe("The suggested make of the vehicle (e.g., 'Toyota', 'Honda'). Null if not found."),
  vehicleMakeConfidence: z
    .number()
    .min(0)
    .max(1)
    .nullable()
    .describe("Confidence score (0-1) for the vehicle make suggestion. Null if not found."),
  vehicleModelSuggestion: z
    .string()
    .nullable()
    .describe("The suggested model of the vehicle (e.g., 'Camry', 'Civic'). Null if not found."),
  vehicleModelConfidence: z
    .number()
    .min(0)
    .max(1)
    .nullable()
    .describe("Confidence score (0-1) for the vehicle model suggestion. Null if not found."),
  vehicleTypeSuggestion: z // This is for the *vehicle's* type (Car, Truck, etc.)
    .string()
    .nullable()
    .describe(`The suggested type of the vehicle (e.g., 'Car', 'SUV', 'Truck'). Prefer suggestions from [${VEHICLE_TYPES.join(', ')}] if possible, but can be other values. Null if not found.`),
  vehicleTypeConfidence: z
    .number()
    .min(0)
    .max(1)
    .nullable()
    .describe("Confidence score (0-1) for the vehicle type suggestion. Null if not found."),
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
  The documents can be Insurance policies, Fitness certificates, PUC (Pollution Under Control) certificates, AITP (All India Tourist Permit) documents, or Vehicle Registration Cards (RC).

  Given the document content, extract the following information. For each piece of information, provide a confidence score (0-1) indicating your certainty.
  If any piece of information is not found, not applicable, or you are unsure, return null for that field and its confidence score.

  1.  **Vehicle Registration Number**: The vehicle's license plate number (e.g., MH12AB1234, DL1CAX0001).
  2.  **Vehicle Make Suggestion**: The manufacturer of the vehicle (e.g., "Maruti Suzuki", "Tata Motors", "Hyundai").
  3.  **Vehicle Model Suggestion**: The model name of the vehicle (e.g., "Swift Dzire", "Nexon", "Creta").
  4.  **Vehicle Type Suggestion**: The category of the vehicle. Try to use one of these if applicable: [${VEHICLE_TYPES.join(', ')}]. If not, provide the type as seen on the document (e.g., "LMV", "Motor Car").
  5.  **Document Type Suggestion**: Classify the document itself. It should be one of [${SuggestableDocumentTypes.join(', ')}]. If it's a vehicle registration card, suggest 'RegistrationCard'. If it doesn't clearly fit, suggest 'Other'. If completely unidentifiable, suggest 'Unknown'.
  6.  **Custom Type Name Suggestion**: If you suggest 'Other' or 'Unknown' for documentTypeSuggestion, provide a brief descriptive name for the document type based on its content (e.g., "Road Tax Receipt", "Special Permit"). Otherwise, set to null.
  7.  **Policy Number or Document Number**: The primary identification number of the document (e.g., insurance policy number, PUC certificate number). This may be N/A for a registration card.
  8.  **Start Date**: The date from which the document is valid (e.g., insurance start date, permit issue date), in YYYY-MM-DD format. This might be a registration date for an RC.
  9.  **Expiry Date**: The date on which the document validity ends (e.g., insurance expiry, fitness expiry), in YYYY-MM-DD format. An RC might have a "Valid Upto" date.

  Document Content: {{media url=documentDataUri}}

  Prioritize accuracy. If a vehicle registration number appears multiple times, pick the most prominent one.
  Return all dates strictly in YYYY-MM-DD format. If a date is present but in a different format, convert it. If conversion is not possible with high confidence, return null for the date.
  For vehicle make, model, and type, if the information is clearly present on a Registration Card, extract it. For other document types, these fields might be null.
  Strictly adhere to the JSON output schema provided.

  Example Output for a Registration Card:
  {
    "vehicleRegistrationNumber": "MH14FU1234",
    "vehicleRegistrationNumberConfidence": 0.98,
    "vehicleMakeSuggestion": "MARUTI SUZUKI INDIA LTD",
    "vehicleMakeConfidence": 0.95,
    "vehicleModelSuggestion": "SWIFT DZIRE VXI",
    "vehicleModelConfidence": 0.92,
    "vehicleTypeSuggestion": "Motor Car", 
    "vehicleTypeConfidence": 0.88,
    "documentTypeSuggestion": "RegistrationCard",
    "documentTypeConfidence": 0.99,
    "customTypeNameSuggestion": null,
    "policyNumber": null,
    "policyNumberConfidence": null,
    "startDate": "2018-07-15", // Registration Date
    "startDateConfidence": 0.90,
    "expiryDate": "2033-07-14", // Valid Upto Date
    "expiryDateConfidence": 0.99
  }

  Example for Insurance:
  {
    "vehicleRegistrationNumber": "DL10CA1234",
    "vehicleRegistrationNumberConfidence": 0.97,
    "vehicleMakeSuggestion": null, // Might not be on insurance
    "vehicleMakeConfidence": null,
    "vehicleModelSuggestion": null, // Might not be on insurance
    "vehicleModelConfidence": null,
    "vehicleTypeSuggestion": null, // Might not be on insurance
    "vehicleTypeConfidence": null,
    "documentTypeSuggestion": "Insurance",
    "documentTypeConfidence": 0.96,
    "customTypeNameSuggestion": null,
    "policyNumber": "P123456789",
    "policyNumberConfidence": 0.92,
    "startDate": "2023-05-01",
    "startDateConfidence": 0.90,
    "expiryDate": "2024-04-30",
    "expiryDateConfidence": 0.99
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


