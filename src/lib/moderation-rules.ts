/**
 * Free first-pass moderation: plain keyword rules from SPEC "Banned items" and "Keeping deals on
 * the platform". Runs on every listing before any AI check; anything it catches goes to the admin
 * review queue (M9) rather than being rejected outright, so a false alarm only costs a review.
 */
const RULES: Array<{ reason: string; pattern: RegExp }> = [
  {
    reason: "Weapons or ammunition",
    // Tool and toy "guns" (nail gun, glue gun, Nerf gun…) are everyday garage leftovers.
    pattern:
      /\b((?<!\b(glue|nail|heat|caulk|caulking|staple|grease|paint|spray|water|nerf|toy|massage|squirt|label|price|tape|soldering|airbrush|brad|framing|finish|finishing|air|impact|rivet|foam|bubble|dart|cap|laser) )guns?|firearms?|rifles?|shotguns?|pistols?|handguns?|revolvers?|ammo|ammunition|rounds of|gunpowder|silencers?|suppressors?)\b/i,
  },
  {
    reason: "Drugs or prescriptions",
    pattern: /\b(marijuana|cannabis|thc|kratom|prescription|rx only|pills?|opioids?|narcotics?)\b/i,
  },
  {
    reason: "Alcohol",
    pattern:
      /\b(liquor|whiske?y|bourbon|vodka|tequila|rum bottle|unopened (wine|beer|champagne)|sealed bottle of)\b/i,
  },
  {
    reason: "Tobacco or vapes",
    pattern: /\b(tobacco|cigarettes?|cigars?|vapes?|vaping|e-?cigs?|juul|nicotine)\b/i,
  },
  {
    reason: "Recalled or unsafe kids' gear",
    pattern: /\b(car seats?|booster seats?|drop[- ]side cribs?|recalled)\b/i,
  },
  {
    reason: "Counterfeits",
    pattern:
      /\b(counterfeit|replica|knock-?off|fake (rolex|gucci|louis|lv|chanel|designer)|inspired by (gucci|louis|chanel))\b/i,
  },
  {
    reason: "Live animals",
    pattern: /\b(puppy|puppies|kittens?|live (animals?|chickens?|fish|birds?)|rehoming)\b/i,
  },
  {
    reason: "Hazardous materials",
    pattern:
      /\b(gasoline|kerosene|pesticides?|herbicides?|asbestos|fireworks|explosives?|full propane tank)\b/i,
  },
  {
    reason: "Contact details or off-platform payment",
    pattern:
      /(\b\d{3}[\s.-]?\d{3}[\s.-]?\d{4}\b|[\w.+-]+@[\w-]+\.[\w.]+|\b(venmo|zelle|cash ?app|paypal me|text me|call me)\b)/i,
  },
];

export function keywordModeration(text: string): { verdict: "ok" | "flagged"; reasons: string[] } {
  const reasons = RULES.filter((r) => r.pattern.test(text)).map((r) => r.reason);
  return { verdict: reasons.length > 0 ? "flagged" : "ok", reasons };
}
