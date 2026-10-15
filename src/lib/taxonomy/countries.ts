export interface Country {
  code: string; // ISO-3166 alpha-2
  name: string;
  aliases: string[];
  currency: string;
  regions: string[];
  cities: string[];
}

export const COUNTRIES: Country[] = [
  { code: "IN", name: "India", aliases: ["india", "bharat"], currency: "INR", regions: ["APAC", "ASIA"], cities: ["bangalore", "bengaluru", "mumbai", "delhi", "new delhi", "hyderabad", "chennai", "pune", "gurgaon", "gurugram", "noida", "kolkata", "ahmedabad", "kochi", "jaipur", "chandigarh"] },
  { code: "US", name: "United States", aliases: ["united states", "usa", "u.s.", "us", "united states of america", "america"], currency: "USD", regions: ["AMERICAS", "NORTH_AMERICA"], cities: ["new york", "nyc", "san francisco", "seattle", "austin", "boston", "chicago", "los angeles", "denver", "atlanta", "washington, dc", "washington dc", "miami", "dallas", "houston", "san jose", "palo alto", "mountain view", "portland", "philadelphia", "phoenix", "san diego", "pittsburgh", "minneapolis", "salt lake city", "raleigh", "detroit", "nashville", "menlo park", "sunnyvale", "redwood city", "brooklyn"] },
  { code: "CA", name: "Canada", aliases: ["canada"], currency: "CAD", regions: ["AMERICAS", "NORTH_AMERICA"], cities: ["toronto", "vancouver", "montreal", "ottawa", "calgary", "waterloo", "edmonton"] },
  { code: "GB", name: "United Kingdom", aliases: ["united kingdom", "uk", "u.k.", "great britain", "britain", "england", "scotland", "wales", "northern ireland"], currency: "GBP", regions: ["EUROPE", "EMEA"], cities: ["london", "manchester", "edinburgh", "bristol", "cambridge", "oxford", "birmingham", "leeds", "glasgow", "belfast"] },
  { code: "IE", name: "Ireland", aliases: ["ireland"], currency: "EUR", regions: ["EUROPE", "EU", "EMEA"], cities: ["dublin", "cork", "galway"] },
  { code: "DE", name: "Germany", aliases: ["germany", "deutschland"], currency: "EUR", regions: ["EUROPE", "EU", "EMEA"], cities: ["berlin", "munich", "münchen", "hamburg", "frankfurt", "cologne", "köln", "stuttgart", "düsseldorf", "dusseldorf", "leipzig"] },
  { code: "FR", name: "France", aliases: ["france"], currency: "EUR", regions: ["EUROPE", "EU", "EMEA"], cities: ["paris", "lyon", "toulouse", "marseille", "nantes", "lille"] },
  { code: "NL", name: "Netherlands", aliases: ["netherlands", "the netherlands", "holland"], currency: "EUR", regions: ["EUROPE", "EU", "EMEA"], cities: ["amsterdam", "rotterdam", "utrecht", "eindhoven", "the hague"] },
  { code: "ES", name: "Spain", aliases: ["spain", "españa"], currency: "EUR", regions: ["EUROPE", "EU", "EMEA"], cities: ["madrid", "barcelona", "valencia", "seville", "malaga"] },
  { code: "PT", name: "Portugal", aliases: ["portugal"], currency: "EUR", regions: ["EUROPE", "EU", "EMEA"], cities: ["lisbon", "porto"] },
  { code: "IT", name: "Italy", aliases: ["italy", "italia"], currency: "EUR", regions: ["EUROPE", "EU", "EMEA"], cities: ["milan", "rome", "turin", "bologna"] },
  { code: "BE", name: "Belgium", aliases: ["belgium"], currency: "EUR", regions: ["EUROPE", "EU", "EMEA"], cities: ["brussels", "antwerp", "ghent"] },
  { code: "CH", name: "Switzerland", aliases: ["switzerland"], currency: "CHF", regions: ["EUROPE", "EMEA"], cities: ["zurich", "zürich", "geneva", "basel", "lausanne", "bern"] },
  { code: "AT", name: "Austria", aliases: ["austria"], currency: "EUR", regions: ["EUROPE", "EU", "EMEA"], cities: ["vienna", "wien", "graz"] },
  { code: "SE", name: "Sweden", aliases: ["sweden"], currency: "SEK", regions: ["EUROPE", "EU", "EMEA", "NORDICS"], cities: ["stockholm", "gothenburg", "malmö", "malmo"] },
  { code: "NO", name: "Norway", aliases: ["norway"], currency: "NOK", regions: ["EUROPE", "EMEA", "NORDICS"], cities: ["oslo", "bergen"] },
  { code: "DK", name: "Denmark", aliases: ["denmark"], currency: "DKK", regions: ["EUROPE", "EU", "EMEA", "NORDICS"], cities: ["copenhagen", "aarhus"] },
  { code: "FI", name: "Finland", aliases: ["finland"], currency: "EUR", regions: ["EUROPE", "EU", "EMEA", "NORDICS"], cities: ["helsinki", "espoo", "tampere"] },
  { code: "PL", name: "Poland", aliases: ["poland", "polska"], currency: "PLN", regions: ["EUROPE", "EU", "EMEA"], cities: ["warsaw", "krakow", "kraków", "wroclaw", "wrocław", "gdansk", "poznan"] },
  { code: "CZ", name: "Czechia", aliases: ["czech republic", "czechia"], currency: "CZK", regions: ["EUROPE", "EU", "EMEA"], cities: ["prague", "brno"] },
  { code: "RO", name: "Romania", aliases: ["romania"], currency: "RON", regions: ["EUROPE", "EU", "EMEA"], cities: ["bucharest", "cluj-napoca", "cluj"] },
  { code: "HU", name: "Hungary", aliases: ["hungary"], currency: "HUF", regions: ["EUROPE", "EU", "EMEA"], cities: ["budapest"] },
  { code: "GR", name: "Greece", aliases: ["greece"], currency: "EUR", regions: ["EUROPE", "EU", "EMEA"], cities: ["athens", "thessaloniki"] },
  { code: "EE", name: "Estonia", aliases: ["estonia"], currency: "EUR", regions: ["EUROPE", "EU", "EMEA"], cities: ["tallinn"] },
  { code: "LT", name: "Lithuania", aliases: ["lithuania"], currency: "EUR", regions: ["EUROPE", "EU", "EMEA"], cities: ["vilnius"] },
  { code: "UA", name: "Ukraine", aliases: ["ukraine"], currency: "UAH", regions: ["EUROPE", "EMEA"], cities: ["kyiv", "kiev", "lviv"] },
  { code: "TR", name: "Turkey", aliases: ["turkey", "türkiye", "turkiye"], currency: "TRY", regions: ["EUROPE", "EMEA"], cities: ["istanbul", "ankara"] },
  { code: "IL", name: "Israel", aliases: ["israel"], currency: "ILS", regions: ["EMEA", "MIDDLE_EAST"], cities: ["tel aviv", "jerusalem", "haifa"] },
  { code: "AE", name: "United Arab Emirates", aliases: ["united arab emirates", "uae"], currency: "AED", regions: ["EMEA", "MIDDLE_EAST"], cities: ["dubai", "abu dhabi"] },
  { code: "SA", name: "Saudi Arabia", aliases: ["saudi arabia", "ksa"], currency: "SAR", regions: ["EMEA", "MIDDLE_EAST"], cities: ["riyadh", "jeddah"] },
  { code: "ZA", name: "South Africa", aliases: ["south africa"], currency: "ZAR", regions: ["EMEA", "AFRICA"], cities: ["cape town", "johannesburg", "durban"] },
  { code: "NG", name: "Nigeria", aliases: ["nigeria"], currency: "NGN", regions: ["EMEA", "AFRICA"], cities: ["lagos", "abuja"] },
  { code: "KE", name: "Kenya", aliases: ["kenya"], currency: "KES", regions: ["EMEA", "AFRICA"], cities: ["nairobi"] },
  { code: "EG", name: "Egypt", aliases: ["egypt"], currency: "EGP", regions: ["EMEA", "AFRICA", "MIDDLE_EAST"], cities: ["cairo"] },
  { code: "AU", name: "Australia", aliases: ["australia"], currency: "AUD", regions: ["APAC", "OCEANIA"], cities: ["sydney", "melbourne", "brisbane", "perth", "adelaide", "canberra"] },
  { code: "NZ", name: "New Zealand", aliases: ["new zealand", "aotearoa"], currency: "NZD", regions: ["APAC", "OCEANIA"], cities: ["auckland", "wellington", "christchurch"] },
  { code: "SG", name: "Singapore", aliases: ["singapore"], currency: "SGD", regions: ["APAC", "ASIA"], cities: [] },
  { code: "MY", name: "Malaysia", aliases: ["malaysia"], currency: "MYR", regions: ["APAC", "ASIA"], cities: ["kuala lumpur", "penang"] },
  { code: "ID", name: "Indonesia", aliases: ["indonesia"], currency: "IDR", regions: ["APAC", "ASIA"], cities: ["jakarta", "bali"] },
  { code: "PH", name: "Philippines", aliases: ["philippines"], currency: "PHP", regions: ["APAC", "ASIA"], cities: ["manila", "cebu", "makati"] },
  { code: "TH", name: "Thailand", aliases: ["thailand"], currency: "THB", regions: ["APAC", "ASIA"], cities: ["bangkok"] },
  { code: "VN", name: "Vietnam", aliases: ["vietnam", "viet nam"], currency: "VND", regions: ["APAC", "ASIA"], cities: ["ho chi minh city", "hanoi"] },
  { code: "JP", name: "Japan", aliases: ["japan"], currency: "JPY", regions: ["APAC", "ASIA"], cities: ["tokyo", "osaka", "kyoto"] },
  { code: "KR", name: "South Korea", aliases: ["south korea", "korea", "republic of korea"], currency: "KRW", regions: ["APAC", "ASIA"], cities: ["seoul", "busan"] },
  { code: "CN", name: "China", aliases: ["china", "prc"], currency: "CNY", regions: ["APAC", "ASIA"], cities: ["beijing", "shanghai", "shenzhen", "hangzhou", "guangzhou"] },
  { code: "HK", name: "Hong Kong", aliases: ["hong kong"], currency: "HKD", regions: ["APAC", "ASIA"], cities: [] },
  { code: "TW", name: "Taiwan", aliases: ["taiwan"], currency: "TWD", regions: ["APAC", "ASIA"], cities: ["taipei"] },
  { code: "PK", name: "Pakistan", aliases: ["pakistan"], currency: "PKR", regions: ["APAC", "ASIA"], cities: ["karachi", "lahore", "islamabad"] },
  { code: "BD", name: "Bangladesh", aliases: ["bangladesh"], currency: "BDT", regions: ["APAC", "ASIA"], cities: ["dhaka"] },
  { code: "LK", name: "Sri Lanka", aliases: ["sri lanka"], currency: "LKR", regions: ["APAC", "ASIA"], cities: ["colombo"] },
  { code: "BR", name: "Brazil", aliases: ["brazil", "brasil"], currency: "BRL", regions: ["AMERICAS", "LATAM"], cities: ["são paulo", "sao paulo", "rio de janeiro", "belo horizonte", "florianópolis"] },
  { code: "MX", name: "Mexico", aliases: ["mexico", "méxico"], currency: "MXN", regions: ["AMERICAS", "LATAM", "NORTH_AMERICA"], cities: ["mexico city", "guadalajara", "monterrey"] },
  { code: "AR", name: "Argentina", aliases: ["argentina"], currency: "ARS", regions: ["AMERICAS", "LATAM"], cities: ["buenos aires", "córdoba"] },
  { code: "CO", name: "Colombia", aliases: ["colombia"], currency: "COP", regions: ["AMERICAS", "LATAM"], cities: ["bogotá", "bogota", "medellín", "medellin"] },
  { code: "CL", name: "Chile", aliases: ["chile"], currency: "CLP", regions: ["AMERICAS", "LATAM"], cities: ["santiago"] },
  { code: "PE", name: "Peru", aliases: ["peru", "perú"], currency: "PEN", regions: ["AMERICAS", "LATAM"], cities: ["lima"] },
];

export const REGION_LABELS: Record<string, string> = {
  WORLDWIDE: "Worldwide",
  EUROPE: "Europe",
  EU: "European Union",
  EMEA: "EMEA",
  APAC: "Asia-Pacific",
  ASIA: "Asia",
  OCEANIA: "Australia & New Zealand",
  AMERICAS: "Americas",
  NORTH_AMERICA: "North America",
  LATAM: "Latin America",
  MIDDLE_EAST: "Middle East",
  AFRICA: "Africa",
  NORDICS: "Nordics",
};

const REGION_ALIASES: [RegExp, string][] = [
  [/\b(worldwide|anywhere|global(ly)?|all countries|any location)\b/i, "WORLDWIDE"],
  [/\b(european union|\beu\b)/i, "EU"],
  [/\beurope(an)?\b/i, "EUROPE"],
  [/\bemea\b/i, "EMEA"],
  [/\b(apac|asia[\s-]pacific)\b/i, "APAC"],
  [/\basia\b/i, "ASIA"],
  [/\b(north america|n\. america)\b/i, "NORTH_AMERICA"],
  [/\b(latam|latin america|south america)\b/i, "LATAM"],
  [/\bamericas\b/i, "AMERICAS"],
  [/\bmiddle east\b/i, "MIDDLE_EAST"],
  [/\bafrica\b/i, "AFRICA"],
  [/\bnordics?\b/i, "NORDICS"],
  [/\b(oceania|anz)\b/i, "OCEANIA"],
];

export const countryByCode = (code: string) => COUNTRIES.find((c) => c.code === code.toUpperCase());
export const countryName = (code: string) => countryByCode(code)?.name ?? code;

function containsTerm(haystack: string, term: string) {
  const esc = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}])${esc}($|[^\\p{L}])`, "iu").test(haystack);
}

/**
 * Resolve country codes mentioned in a location string. Only explicit names,
 * aliases, cities, and US/CA state suffixes are used — no guessing.
 */
export function countriesInText(text: string | null | undefined): string[] {
  if (!text) return [];
  const t = text.toLowerCase();
  const out = new Set<string>();
  for (const c of COUNTRIES) {
    // Two-letter aliases ("us", "uk") are only trusted when uppercase in the original text.
    const longAliases = c.aliases.filter((a) => a.length > 3 || a.includes("."));
    const shortAliases = c.aliases.filter((a) => a.length <= 3 && !a.includes("."));
    if (longAliases.some((a) => containsTerm(t, a)) || c.cities.some((city) => containsTerm(t, city))) out.add(c.code);
    else if (shortAliases.some((a) => new RegExp(`\\b${a.toUpperCase()}\\b`).test(text))) out.add(c.code);
  }
  // "City, ST" style US locations.
  if (/,\s*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b(?!\w)/.test(text)) {
    if (!/,\s*CA\b.*canada/i.test(text)) out.add("US");
  }
  if (/,\s*(ON|BC|QC|AB|MB|NS|NB|SK)\b/.test(text) && /canada|toronto|vancouver|montreal|ottawa|calgary|waterloo/i.test(text)) out.add("CA");
  return [...out];
}

export function regionsInText(text: string | null | undefined): string[] {
  if (!text) return [];
  return [...new Set(REGION_ALIASES.filter(([re]) => re.test(text)).map(([, r]) => r))];
}

/** Whether a candidate located in `countryCode` falls inside a region code. */
export function countryInRegion(countryCode: string, region: string): boolean {
  if (region === "WORLDWIDE") return true;
  return countryByCode(countryCode)?.regions.includes(region) ?? false;
}

export const ADZUNA_COUNTRIES = ["gb", "us", "at", "au", "be", "br", "ca", "ch", "de", "es", "fr", "in", "it", "mx", "nl", "nz", "pl", "sg", "za"];
