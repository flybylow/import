/**
 * API Endpoint: POST /api/materials/validate
 * 
 * Takes a list of materials and returns validation data:
 * - Compliance status (PASS/FAIL for 2027 regulations)
 * - Embodied carbon (kg CO2-eq)
 * - EPD ID (link to environmental product declaration)
 * - Timeline events (delivery, verification, swaps)
 * 
 * File: src/app/api/materials/validate/route.ts
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * Main handler function
 */
export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json();
    const { materials, projectId } = body;

    // Validation
    if (!materials || !Array.isArray(materials)) {
      return NextResponse.json(
        {
          error: 'Invalid request',
          details: 'materials array is required and must be an array',
        },
        { status: 400 }
      );
    }

    if (!projectId) {
      return NextResponse.json(
        {
          error: 'Invalid request',
          details: 'projectId is required',
        },
        { status: 400 }
      );
    }

    // Process each material
    const results = materials.map((material: any) => {
      // TODO: Replace these with your actual bimimport logic
      const matched = matchMaterialAgainstKB(material.name);
      const carbon = calculateEmbodiedCarbon(matched);
      const compliant = checkCompliance2027(carbon);
      const timeline = getTimelineForMaterial(matched, projectId);

      return {
        // Input
        name: material.name,
        quantity: material.quantity || null,
        unit: material.unit || null,

        // Output: Compliance
        compliance_2027: compliant ? 'PASS' : 'FAIL',
        compliance_reason: getComplianceReason(compliant, carbon),

        // Output: Carbon
        embodied_carbon: carbon,
        embodied_carbon_unit: 'kg CO2-eq',

        // Output: EPD Link
        epd_id: matched?.epd_id || null,
        epd_source: matched?.source || null,
        epd_confidence: matched?.confidence || null,

        // Output: Timeline
        timeline: timeline,

        // Metadata
        matched: !!matched,
      };
    });

    // Return success response
    return NextResponse.json(
      {
        projectId,
        timestamp: new Date().toISOString(),
        results,
        summary: {
          total_materials: results.length,
          compliant_count: results.filter((r: any) => r.compliance_2027 === 'PASS').length,
          non_compliant_count: results.filter((r: any) => r.compliance_2027 === 'FAIL').length,
        },
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Helper Functions
 * 
 * These are placeholders. Replace with your actual bimimport logic.
 */

/**
 * Match material name against your Knowledge Base (KBOB, Oekobaudat, B-EPD)
 * 
 * TODO: Replace this with call to your actual KB/matching logic from bimimport
 */
function matchMaterialAgainstKB(materialName: string) {
  const mockMatches: Record<string, any> = {
    'concrete c30': {
      epd_id: 'concrete-c30-37',
      carbon: 45.2,
      source: 'KBOB',
      confidence: 0.95,
    },
    'insulation cellulose': {
      epd_id: 'cellulose-insulation-001',
      carbon: 8.5,
      source: 'Oekobaudat',
      confidence: 0.88,
    },
    'steel reinforced': {
      epd_id: 'steel-reinforced-002',
      carbon: 32.1,
      source: 'B-EPD',
      confidence: 0.92,
    },
  };

  const lowerName = materialName.toLowerCase().trim();
  if (mockMatches[lowerName]) {
    return mockMatches[lowerName];
  }

  for (const [key, value] of Object.entries(mockMatches)) {
    if (lowerName.includes(key) || key.includes(lowerName)) {
      return value;
    }
  }

  return null;
}

/**
 * Calculate embodied carbon
 * 
 * TODO: Replace with your actual carbon calculation logic
 */
function calculateEmbodiedCarbon(matched: any): number {
  if (!matched) {
    return 0;
  }
  return matched.carbon || 0;
}

/**
 * Check if material complies with 2027 EU regulations
 */
function checkCompliance2027(carbon: number): boolean {
  const THRESHOLD_2027 = 50; // kg CO2-eq
  return carbon <= THRESHOLD_2027;
}

/**
 * Get human-readable compliance reason
 */
function getComplianceReason(compliant: boolean, carbon: number): string {
  const THRESHOLD = 50;
  
  if (compliant) {
    return `Within 2027 limit (${carbon.toFixed(1)} kg CO2-eq ≤ ${THRESHOLD} kg)`;
  } else {
    const overage = carbon - THRESHOLD;
    return `EXCEEDS 2027 limit by ${overage.toFixed(1)} kg CO2-eq`;
  }
}

/**
 * Get timeline events for a material
 * 
 * TODO: Replace with actual timeline database query
 */
function getTimelineForMaterial(matched: any, projectId: string) {
  if (!matched) {
    return [];
  }

  return [
    {
      date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      action: 'verified',
      actor: 'system',
      message: `Material matched against ${matched.source}`,
    },
  ];
}

/**
 * Type definitions
 */
export interface ValidationRequest {
  projectId: string;
  materials: Material[];
}

export interface Material {
  name: string;
  quantity?: number;
  unit?: string;
}

export interface ValidationResult {
  name: string;
  quantity: number | null;
  unit: string | null;
  compliance_2027: 'PASS' | 'FAIL';
  compliance_reason: string;
  embodied_carbon: number;
  embodied_carbon_unit: string;
  epd_id: string | null;
  epd_source: string | null;
  epd_confidence: number | null;
  timeline: any[];
  matched: boolean;
}
