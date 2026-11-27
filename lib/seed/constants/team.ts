export type CoordKey = "aarav" | "ishita" | "rohan" | "kavya" | "dev" | "sanjana" | "arjun";

/** All phone numbers are fake. */
export const HEAD = { sourceId: "demo-head", name: "Core Head (demo)", phone: "+91 90000 00100" };

export const COORDINATORS: { key: CoordKey; name: string; phone: string; closer: boolean }[] = [
  { key: "aarav", name: "Aarav Nair", phone: "+91 90000 00101", closer: true },
  { key: "ishita", name: "Ishita Rao", phone: "+91 90000 00102", closer: false },
  { key: "rohan", name: "Rohan Mehta", phone: "+91 90000 00103", closer: false },
  { key: "kavya", name: "Kavya Menon", phone: "+91 90000 00104", closer: true },
  { key: "dev", name: "Dev Malhotra", phone: "+91 90000 00105", closer: false },
  { key: "sanjana", name: "Sanjana Pillai", phone: "+91 90000 00106", closer: false },
  { key: "arjun", name: "Arjun Krishnan", phone: "+91 90000 00107", closer: false },
];