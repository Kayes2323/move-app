export interface Checkpoint {
  name: string;
  type: "city" | "upazila" | "bridge" | "junction" | "destination";
  distanceFromStart: number;
  coords: [number, number]; // [lat, lng]
  fact: string;
}

export interface Route {
  id: string;
  name: string;
  destination: string;
  highway: string;
  totalKm: number;
  image: string;
  tagline: string;
  checkpoints: Checkpoint[];
}

export const ROUTES: Route[] = [
  {
    id: "coxsbazar",
    name: "Cox's Bazar",
    destination: "Cox's Bazar",
    highway: "N1",
    totalKm: 414,
    image: "/images/coxsbazar.jpg",
    tagline: "World's longest natural sea beach",
    checkpoints: [
      { name: "Jatrabari", type: "junction", distanceFromStart: 8, coords: [23.7104, 90.4429], fact: "ঢাকার প্রবেশদ্বার। প্রতিদিন ৫ লাখ মানুষ এই মোড় পার হয়।" },
      { name: "Kanchpur", type: "bridge", distanceFromStart: 25, coords: [23.6833, 90.5333], fact: "শীতলক্ষ্যা নদীর উপর ব্রিজ। এই ব্রিজ পার হলেই মনে হয় journey সত্যিই শুরু হলো।" },
      { name: "Meghna-Gomti", type: "bridge", distanceFromStart: 55, coords: [23.5833, 90.6833], fact: "মেঘনা আর গোমতীর মিলনস্থল। দুটো নদী এখানে একসাথে মেশে।" },
      { name: "Daudkandi", type: "upazila", distanceFromStart: 65, coords: [23.5333, 90.7167], fact: "কুমিল্লার প্রবেশদ্বার। নদীপথে এককালে বড় বন্দর ছিল।" },
      { name: "Comilla", type: "city", distanceFromStart: 114, coords: [23.4607, 91.1809], fact: "ময়নামতির মাটির নিচে ১৫০০ বছরের বৌদ্ধ সভ্যতা ঘুমিয়ে আছে।" },
      { name: "Laksam", type: "upazila", distanceFromStart: 135, coords: [23.2333, 91.1333], fact: "রেলপথের গুরুত্বপূর্ণ জংশন। এখান থেকে নোয়াখালী আলাদা হয়।" },
      { name: "Feni", type: "city", distanceFromStart: 165, coords: [23.0239, 91.3966], fact: "মুহুরী নদীর দেশ। এখান থেকেই চট্টগ্রামের পাহাড় দেখা শুরু হয়।" },
      { name: "Mirsarai", type: "upazila", distanceFromStart: 210, coords: [22.8333, 91.5667], fact: "বাংলাদেশের বৃহত্তম অর্থনৈতিক জোন এখানেই। পাহাড় আর সমুদ্রের মাঝে।" },
      { name: "Sitakunda", type: "upazila", distanceFromStart: 235, coords: [22.6167, 91.6667], fact: "চন্দ্রনাথ পাহাড়ের পাদদেশ। পাহাড় থেকে সমুদ্র দেখা যায়।" },
      { name: "Chattogram", type: "city", distanceFromStart: 264, coords: [22.3569, 91.7832], fact: "বন্দরনগরী। বাংলাদেশের ৯২% আমদানি-রপ্তানি এই শহর দিয়ে।" },
      { name: "Patiya", type: "upazila", distanceFromStart: 285, coords: [22.3000, 91.9833], fact: "চট্টগ্রামের বাইরে বের হওয়ার শেষ বড় শহর।" },
      { name: "Dohazari", type: "upazila", distanceFromStart: 310, coords: [22.1667, 92.0833], fact: "পাহাড়ি পথের শুরু। এখান থেকে রাস্তা আরো সুন্দর হয়।" },
      { name: "Chakaria", type: "upazila", distanceFromStart: 355, coords: [21.9667, 92.0667], fact: "কক্সবাজারের দরজা। এখান থেকে সমুদ্রের গন্ধ আসতে শুরু করে।" },
      { name: "Ramu", type: "upazila", distanceFromStart: 385, coords: [21.6167, 92.1000], fact: "বৌদ্ধ বিহারের শহর। শান্ত, সবুজ, ঐতিহ্যবাহী।" },
      { name: "Cox's Bazar", type: "destination", distanceFromStart: 414, coords: [21.4272, 91.9786], fact: "বিশ্বের দীর্ঘতম সমুদ্র সৈকত। ১২০ কিমি বালির উপর ঢেউ আসে যায়।" },
    ],
  },
  {
    id: "chandpur",
    name: "Chandpur",
    destination: "Chandpur",
    highway: "N2",
    totalKm: 132,
    image: "/images/chandpur.jpg",
    tagline: "Home of the Hilsha",
    checkpoints: [
      { name: "Jatrabari", type: "junction", distanceFromStart: 8, coords: [23.7104, 90.4429], fact: "ঢাকার প্রবেশদ্বার। এই মোড় থেকেই দক্ষিণের পথ শুরু।" },
      { name: "Kanchpur", type: "bridge", distanceFromStart: 25, coords: [23.6833, 90.5333], fact: "শীতলক্ষ্যা পার হলেই নারায়ণগঞ্জের মাটি।" },
      { name: "Mograpara", type: "upazila", distanceFromStart: 45, coords: [23.5500, 90.6167], fact: "মেঘনার কাছে ছোট্ট বাজার। নদীর কোলে জীবন।" },
      { name: "Gouripur", type: "upazila", distanceFromStart: 68, coords: [23.4500, 90.7000], fact: "মেঘনার তীরের শান্ত জনপদ।" },
      { name: "Kachua", type: "upazila", distanceFromStart: 95, coords: [23.3333, 90.7667], fact: "চাঁদপুরের কাছাকাছি। এখান থেকে ইলিশের ঘ্রাণ পাওয়া যায়।" },
      { name: "Hajiganj", type: "upazila", distanceFromStart: 112, coords: [23.2500, 90.8500], fact: "চাঁদপুরের প্রবেশদ্বার। পদ্মা-মেঘনার মিলনস্থলের কাছে।" },
      { name: "Chandpur", type: "destination", distanceFromStart: 132, coords: [23.2333, 90.6667], fact: "ইলিশের রাজধানী। পদ্মা, মেঘনা আর ডাকাতিয়া — তিন নদীর মিলনস্থল।" },
    ],
  },
  {
    id: "sylhet",
    name: "Sylhet",
    destination: "Sylhet",
    highway: "N2",
    totalKm: 241,
    image: "/images/sylhet.jpg",
    tagline: "Misty land of tea gardens",
    checkpoints: [
      { name: "Kanchpur", type: "bridge", distanceFromStart: 25, coords: [23.6833, 90.5333], fact: "শীতলক্ষ্যা পার হয়ে উত্তর-পূর্বে যাত্রা শুরু।" },
      { name: "Bhairab", type: "upazila", distanceFromStart: 80, coords: [24.0524, 90.9749], fact: "মেঘনার তীরের ব্যস্ত শহর। রেল ও সড়কপথের গুরুত্বপূর্ণ জংশন।" },
      { name: "Brahmanbaria", type: "city", distanceFromStart: 110, coords: [23.9608, 91.1115], fact: "সংস্কৃতির শহর। ওস্তাদ আলাউদ্দিন খাঁর জন্মভূমি।" },
      { name: "Madhabpur", type: "upazila", distanceFromStart: 155, coords: [24.1333, 91.3167], fact: "হবিগঞ্জের প্রবেশদ্বার। চা বাগানের প্রথম দেখা এখানেই।" },
      { name: "Habiganj", type: "city", distanceFromStart: 185, coords: [24.3742, 91.4152], fact: "চা বাগানের জেলা। সুরমা নদীর কাছাকাছি।" },
      { name: "Shayestaganj", type: "upazila", distanceFromStart: 210, coords: [24.3167, 91.5500], fact: "সিলেটের কাছাকাছি। এখান থেকে পাহাড় আর চা বাগান একসাথে।" },
      { name: "Srimangal", type: "upazila", distanceFromStart: 225, coords: [24.3024, 91.7284], fact: "চায়ের রাজধানী। বাংলাদেশের সবচেয়ে বেশি চা এখানেই হয়।" },
      { name: "Sylhet", type: "destination", distanceFromStart: 241, coords: [24.8949, 91.8687], fact: "হযরত শাহজালালের মাজারের শহর। চা, পাহাড়, আর আধ্যাত্মিকতার মিলনস্থল।" },
    ],
  },
  {
    id: "khulna",
    name: "Khulna",
    destination: "Khulna",
    highway: "N7",
    totalKm: 275,
    image: "/images/khulna.jpg",
    tagline: "Where the Royal Bengal Tiger roams",
    checkpoints: [
      { name: "Mawa", type: "bridge", distanceFromStart: 38, coords: [23.4000, 90.2833], fact: "পদ্মা সেতুর উত্তর পাড়। এই সেতু বাংলাদেশের স্বপ্নের সেতু।" },
      { name: "Faridpur", type: "city", distanceFromStart: 80, coords: [23.6070, 89.8429], fact: "পদ্মার তীরের শহর। দক্ষিণবঙ্গের প্রবেশদ্বার।" },
      { name: "Rajbari", type: "city", distanceFromStart: 110, coords: [23.7574, 89.6438], fact: "পদ্মা-গড়াই নদীর মাঝে। শান্ত, সবুজ জনপদ।" },
      { name: "Magura", type: "city", distanceFromStart: 155, coords: [23.4871, 89.4194], fact: "নবগঙ্গা নদীর তীরে। দক্ষিণ-পশ্চিমের পথে গুরুত্বপূর্ণ শহর।" },
      { name: "Jashore", type: "city", distanceFromStart: 200, coords: [23.1664, 89.2082], fact: "বাংলাদেশের সবচেয়ে পুরনো পৌরসভা। ফুলের শহর।" },
      { name: "Phultala", type: "upazila", distanceFromStart: 248, coords: [22.9000, 89.5167], fact: "খুলনার কাছাকাছি। সুন্দরবনের গন্ধ এখান থেকেই আসে।" },
      { name: "Khulna", type: "destination", distanceFromStart: 275, coords: [22.8456, 89.5403], fact: "সুন্দরবনের দরজা। রয়েল বেঙ্গল টাইগারের আবাসভূমির কাছে।" },
    ],
  },
  {
    id: "rangpur",
    name: "Rangpur",
    destination: "Rangpur",
    highway: "N5",
    totalKm: 320,
    image: "/images/rangpur.jpg",
    tagline: "Where Kanchenjunga meets the horizon",
    checkpoints: [
      { name: "Gazipur", type: "city", distanceFromStart: 25, coords: [23.9999, 90.4203], fact: "শিল্পনগরী। ঢাকার পর বাংলাদেশের সবচেয়ে ব্যস্ত শহর।" },
      { name: "Tangail", type: "city", distanceFromStart: 90, coords: [24.2513, 89.9167], fact: "তাঁতের শহর। টাঙ্গাইলের শাড়ি সারা বাংলাদেশে বিখ্যাত।" },
      { name: "Sirajganj", type: "city", distanceFromStart: 150, coords: [24.4535, 89.7006], fact: "যমুনা সেতুর পাশে। এই সেতু উত্তরবঙ্গকে ঢাকার সাথে জুড়েছে।" },
      { name: "Bogura", type: "city", distanceFromStart: 200, coords: [24.8465, 89.3773], fact: "উত্তরবঙ্গের প্রবেশদ্বার। মহাস্থানগড় — বাংলাদেশের প্রাচীনতম নগর এখানেই।" },
      { name: "Gaibandha", type: "city", distanceFromStart: 255, coords: [25.3283, 89.5285], fact: "তিস্তা নদীর কাছে। চরের মানুষদের জীবন সংগ্রামের শহর।" },
      { name: "Mithapukur", type: "upazila", distanceFromStart: 295, coords: [25.5000, 89.3167], fact: "রংপুরের কাছাকাছি। এখান থেকে কাঞ্চনজঙ্ঘা দেখা যায় শীতে।" },
      { name: "Rangpur", type: "destination", distanceFromStart: 320, coords: [25.7439, 89.2752], fact: "উত্তরের রাজধানী। শীতের সকালে কাঞ্চনজঙ্ঘা দেখা যায় এই শহর থেকে।" },
    ],
  },
  {
    id: "rajshahi",
    name: "Rajshahi",
    destination: "Rajshahi",
    highway: "N6",
    totalKm: 256,
    image: "/images/rajshahi.jpg",
    tagline: "Cleanest city in South Asia",
    checkpoints: [
      { name: "Savar", type: "upazila", distanceFromStart: 28, coords: [23.8573, 90.2662], fact: "জাতীয় স্মৃতিসৌধের শহর। মুক্তিযুদ্ধের স্মৃতিবিজড়িত।" },
      { name: "Tangail", type: "city", distanceFromStart: 95, coords: [24.2513, 89.9167], fact: "তাঁতের শহর। এই পথেই রাজশাহীর দিকে যাত্রা।" },
      { name: "Sirajganj", type: "city", distanceFromStart: 150, coords: [24.4535, 89.7006], fact: "যমুনার পাড়ে। পশ্চিমের পথে গুরুত্বপূর্ণ মোড়।" },
      { name: "Natore", type: "city", distanceFromStart: 210, coords: [24.4204, 89.0004], fact: "নাটোরের রানী ভবানীর ইতিহাস। চলনবিলের কাছে।" },
      { name: "Puthia", type: "upazila", distanceFromStart: 238, coords: [24.3667, 88.8500], fact: "মন্দিরের শহর। বাংলাদেশের সবচেয়ে বেশি পুরনো মন্দির এখানে।" },
      { name: "Rajshahi", type: "destination", distanceFromStart: 256, coords: [24.3745, 88.6042], fact: "রেশম আর আমের শহর। পদ্মার তীরে দক্ষিণ এশিয়ার সবচেয়ে পরিষ্কার শহর।" },
    ],
  },
  {
    id: "barisal",
    name: "Barisal",
    destination: "Barisal",
    highway: "N8",
    totalKm: 154,
    image: "/images/barisal.jpg",
    tagline: "Countryside of canals & rivers",
    checkpoints: [
      { name: "Jatrabari", type: "junction", distanceFromStart: 8, coords: [23.7104, 90.4429], fact: "ঢাকার দক্ষিণ প্রবেশদ্বার। দক্ষিণের পথে যাত্রা এখান থেকেই।" },
      { name: "Mawa", type: "bridge", distanceFromStart: 38, coords: [23.4000, 90.2833], fact: "পদ্মা সেতু। এই সেতু বরিশালকে ঢাকার আরো কাছে এনেছে।" },
      { name: "Shariatpur", type: "city", distanceFromStart: 65, coords: [23.2432, 90.4348], fact: "পদ্মার দক্ষিণ তীরে। নদীমাতৃক বাংলাদেশের আসল রূপ এখানে।" },
      { name: "Madaripur", type: "city", distanceFromStart: 90, coords: [23.1641, 90.2023], fact: "আড়িয়াল খাঁ নদীর তীরে। দক্ষিণবঙ্গের প্রাণকেন্দ্র।" },
      { name: "Gournadi", type: "upazila", distanceFromStart: 125, coords: [22.9667, 90.2667], fact: "বরিশালের কাছাকাছি। খাল-বিল-নদীর অপূর্ব দেশ।" },
      { name: "Barisal", type: "destination", distanceFromStart: 154, coords: [22.701, 90.3535], fact: "ভেনিস অব বেঙ্গল। নদী, খাল আর নৌকার শহর।" },
    ],
  },
];

// Haversine distance between two coordinates
export function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Find nearest checkpoint in a route to given coordinates
export function findNearestCheckpoint(
  route: Route,
  userLat: number,
  userLng: number
): { checkpoint: Checkpoint; index: number; distanceKm: number } {
  let nearest = route.checkpoints[0];
  let nearestIdx = 0;
  let nearestDist = Infinity;

  route.checkpoints.forEach((cp, i) => {
    const d = haversineDistance(userLat, userLng, cp.coords[0], cp.coords[1]);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = cp;
      nearestIdx = i;
    }
  });

  return { checkpoint: nearest, index: nearestIdx, distanceKm: nearestDist };
}

// Find nearest route to user location (across all routes)
export function findNearestRoute(
  userLat: number,
  userLng: number
): { route: Route; checkpoint: Checkpoint; checkpointIndex: number } {
  let nearestRoute = ROUTES[0];
  let nearestCp = ROUTES[0].checkpoints[0];
  let nearestIdx = 0;
  let nearestDist = Infinity;

  ROUTES.forEach(route => {
    const { checkpoint, index, distanceKm } = findNearestCheckpoint(route, userLat, userLng);
    if (distanceKm < nearestDist) {
      nearestDist = distanceKm;
      nearestRoute = route;
      nearestCp = checkpoint;
      nearestIdx = index;
    }
  });

  return { route: nearestRoute, checkpoint: nearestCp, checkpointIndex: nearestIdx };
}

export const ROUTE_MAP: Record<string, Route> = Object.fromEntries(
  ROUTES.map(r => [r.id, r])
);