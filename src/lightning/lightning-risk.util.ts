export enum RiskLevel {
  BAIXO = 'BAIXO',
  MEDIO = 'MEDIO',
  ALTO = 'ALTO',
}

export function ClassifyLightningRisk(intensityKa: number | null): RiskLevel {
  if (intensityKa === null || intensityKa === undefined || intensityKa < 20) {
    return RiskLevel.BAIXO;
  }
  if (intensityKa <= 40) {
    return RiskLevel.MEDIO;
  }
  return RiskLevel.ALTO;
}