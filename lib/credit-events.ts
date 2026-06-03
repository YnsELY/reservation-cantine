// Signal léger entre l'annulation (history) et l'accueil parent :
// déclenche un popup "cagnotte créditée" la prochaine fois que l'accueil prend le focus.
let pendingCreditCelebration = false;

export function flagCreditAdded(): void {
  pendingCreditCelebration = true;
}

export function consumeCreditAdded(): boolean {
  const v = pendingCreditCelebration;
  pendingCreditCelebration = false;
  return v;
}
