export type SeedFest = {
  name: string;
  institution: string;
  city: string;
  tier: "iit" | "iim" | "other";
  start: string;
  end: string;
  status: "todo" | "researching" | "done";
};

/** All fictional. 6 IIT fests, 3 Bangalore or Mumbai, 3 Chennai. */
export const FESTS: SeedFest[] = [
  { name: "Aurora Tech Fest (SIM)", institution: "Demo IIT Campus 1", city: "Kharagpur", tier: "iit", start: "2026-12-04", end: "2026-12-06", status: "done" },
  { name: "Meridian Cultural Fest (SIM)", institution: "Demo IIT Campus 2", city: "Kanpur", tier: "iit", start: "2026-12-11", end: "2026-12-13", status: "done" },
  { name: "Solstice Fest (SIM)", institution: "Demo IIT Campus 3", city: "Roorkee", tier: "iit", start: "2026-12-18", end: "2026-12-20", status: "done" },
  { name: "Horizon Fest (SIM)", institution: "Demo IIT Campus 4", city: "Guwahati", tier: "iit", start: "2027-01-15", end: "2027-01-17", status: "researching" },
  { name: "Cascade Fest (SIM)", institution: "Demo IIT Campus 5", city: "Hyderabad", tier: "iit", start: "2027-02-05", end: "2027-02-07", status: "researching" },
  { name: "Lumina Fest (SIM)", institution: "Demo IIT Campus 6", city: "Delhi", tier: "iit", start: "2027-02-19", end: "2027-02-21", status: "researching" },
  { name: "Vertex Management Fest (SIM)", institution: "Demo Management Institute 1", city: "Bangalore", tier: "iim", start: "2026-12-12", end: "2026-12-14", status: "todo" },
  { name: "Tessera Fest (SIM)", institution: "Demo College Bangalore", city: "Bangalore", tier: "other", start: "2026-12-26", end: "2026-12-28", status: "todo" },
  { name: "Monsoon Beat Fest (SIM)", institution: "Demo College Mumbai", city: "Mumbai", tier: "other", start: "2027-01-22", end: "2027-01-24", status: "todo" },
  { name: "Marina Fest (SIM)", institution: "Demo College Chennai 1", city: "Chennai", tier: "other", start: "2026-12-09", end: "2026-12-10", status: "todo" },
  { name: "Kaveri Fest (SIM)", institution: "Demo College Chennai 2", city: "Chennai", tier: "other", start: "2026-12-23", end: "2026-12-24", status: "todo" },
  { name: "Coromandel Fest (SIM)", institution: "Demo College Chennai 3", city: "Chennai", tier: "other", start: "2027-01-29", end: "2027-01-30", status: "todo" },
];

const NAMES: [string, string][] = [
  ["Alderline Beverages", "food_beverage"], ["Brightwave Telecom", "telecom"], ["Cobalt Retail", "retail_ecommerce"],
  ["Dunmore Autos", "automotive"], ["Elmgrove Finance", "banking_financial_services_insurance"], ["Fernbridge Foods", "food_beverage"],
  ["Glenwood Electronics", "electronics_electricals"], ["Harbor Apparel", "fashion_beauty_lifestyle"], ["Ivorytree Edu", "education_edtech"],
  ["Juniper Travels", "travel_hospitality_leisure"], ["Kitebridge Mobility", "automotive"], ["Lumen Wellness", "healthcare_pharma_wellness"],
  ["Marlow Media", "media_entertainment"], ["Northgate Pharma", "healthcare_pharma_wellness"], ["Oakhurst Home Care", "consumer_goods_fmcg"],
  ["Pinewell Insurance", "banking_financial_services_insurance"], ["Quillon Services", "consumer_services"], ["Ridgeway Energy", "energy_industrials_manufacturing"],
  ["Stonefield Banking", "banking_financial_services_insurance"], ["Tamarind Snacks", "food_beverage"], ["Umbra Gaming", "technology_internet"],
  ["Valewood Fashion", "fashion_beauty_lifestyle"], ["Westbrook Consulting", "consulting_professional_services"], ["Xylem Fitness", "sports"],
  ["Yarrowfield Dairy", "food_beverage"], ["Zephyr Cabs", "consumer_services"], ["Amberfield Stationery", "retail_ecommerce"],
  ["Birchmoor Cycles", "sports"], ["Cedarline Cafe", "food_qsr"], ["Driftstone Gadgets", "electronics_electricals"],
];

const TIERS = ["title", "associate", "partner"];

export type SeedSponsor = { fest: number; name: string; sector: string; tier: string; year: number };

/** 30 sponsors: the first six fests get three each, the rest two each. */
export const SPONSORS: SeedSponsor[] = NAMES.map(([name, sector], i) => ({
  fest: i % FESTS.length,
  name: `${name} (demo)`,
  sector,
  tier: TIERS[i % TIERS.length] ?? "partner",
  year: 2026,
}));