#!/usr/bin/env python3
"""
Careful bilingual names for Q.E.A school data.

- Students: Arabic is source of truth → produce French-style Latin
- Teachers: Latin-only → produce Arabic; Arabic → produce correct Latin
- Prefer known Algerian spellings over letter-by-letter mapping
"""
from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "school_data.json"
REPORT = ROOT / "data" / "name_bilingual_report.txt"

AR_RE = re.compile(r"[\u0600-\u06FF]")
LAT_RE = re.compile(r"[A-Za-z]")

# ─── Particles / prefixes (Arabic → Latin) ───────────────────────────
PARTICLES_AR = {
    "بن": "Ben",
    "ابن": "Ibn",
    "بنت": "Bent",
    "بو": "Bou",
    "ايت": "Ait",
    "آيت": "Ait",
    "أيت": "Ait",
    "ال": "El",
    "حاج": "Hadj",
    "الحاج": "El Hadj",
    "سيدي": "Sidi",
    "ولد": "Ould",
}

# ─── Given names Arabic → French Maghrebi Latin ─────────────────────
GIVEN_AR2LAT = {
    "محمد": "Mohamed",
    "محمّد": "Mohamed",
    "احمد": "Ahmed",
    "أحمد": "Ahmed",
    "امير": "Amir",
    "أمير": "Amir",
    "امين": "Amine",
    "أمين": "Amine",
    "ادم": "Adam",
    "آدم": "Adam",
    "انس": "Anes",
    "أنس": "Anes",
    "انيس": "Anis",
    "أنيس": "Anis",
    "جواد": "Djouad",
    "سامي": "Sami",
    "زياد": "Ziad",
    "ميس": "Mays",
    "ماهر": "Maher",
    "مريم": "Meriem",
    "فاطمة": "Fatima",
    "فاطمه": "Fatima",
    "عائشة": "Aicha",
    "عايشة": "Aicha",
    "ايمان": "Imane",
    "إيمان": "Imane",
    "ياسين": "Yacine",
    "يوسف": "Youcef",
    "يونس": "Younes",
    "علي": "Ali",
    "سارة": "Sara",
    "ساره": "Sara",
    "نور": "Nour",
    "ريم": "Rim",
    "لينا": "Lina",
    "لينة": "Lina",
    "لين": "Lynn",
    "آية": "Aya",
    "اية": "Aya",
    "آيا": "Aya",
    "ملك": "Malek",
    "ملاك": "Melak",
    "مالك": "Malek",
    "خالد": "Khaled",
    "سليم": "Salim",
    "سلمى": "Selma",
    "هند": "Hind",
    "هدى": "Houda",
    "هناء": "Hana",
    "رانيا": "Rania",
    "رانية": "Rania",
    "اسامة": "Oussama",
    "أسامة": "Oussama",
    "عمر": "Omar",
    "كريم": "Karim",
    "نادر": "Nader",
    "نادية": "Nadia",
    "ناديا": "Nadia",
    "سمير": "Samir",
    "سمية": "Soumia",
    "سميرة": "Samira",
    "حسين": "Hocine",
    "حسن": "Hassan",
    "ابراهيم": "Ibrahim",
    "إبراهيم": "Ibrahim",
    "اسماعيل": "Ismail",
    "إسماعيل": "Ismail",
    "عيسى": "Aissa",
    "عيسي": "Aissa",
    "لياس": "Ilyas",
    "إلياس": "Ilyas",
    "الياس": "Ilyas",
    "ريان": "Rayane",
    "ريّان": "Rayane",
    "ياسمين": "Yasmine",
    "ماريا": "Maria",
    "مايا": "Maya",
    "صوفيا": "Sofia",
    "زكريا": "Zakaria",
    "زكرياء": "Zakaria",
    "وسيم": "Wassim",
    "وسام": "Wissam",
    "سيرين": "Sirine",
    "رسيم": "Racim",
    "نزيم": "Nazim",
    "نائل": "Nail",
    "نايل": "Nail",
    "نيليا": "Nelia",
    "اسحاق": "Ishak",
    "إسحاق": "Ishak",
    "إليان": "Elyane",
    "اليان": "Elyane",
    "الين": "Aline",
    "آلين": "Aline",
    "نهال": "Nihal",
    "ايناس": "Ines",
    "إيناس": "Ines",
    "يانيس": "Yanis",
    "يانس": "Yanis",
    "كنزي": "Kenzi",
    "ميرال": "Miral",
    "فرح": "Farah",
    "ريهام": "Riham",
    "اناييس": "Anais",
    "أناييس": "Anais",
    "نعيمة": "Naima",
    "نعيّمة": "Naima",
    "رزيقة": "Razika",
    "اسماء": "Asma",
    "أسماء": "Asma",
    "إسماء": "Asma",
    "فارس": "Fares",
    "فتيحة": "Fatiha",
    "امال": "Amel",
    "آمال": "Amel",
    "أمال": "Amel",
    "عبلة": "Abla",
    "نجاة": "Nadjat",
    "خديجة": "Khadidja",
    "خديجه": "Khadidja",
    "ربيعة": "Rabia",
    "شيماء": "Chaima",
    "اكرام": "Ikram",
    "إكرام": "Ikram",
    "بشيرة": "Bachira",
    "مروى": "Marwa",
    "مروة": "Marwa",
    "حنان": "Hanane",
    "كمال": "Kamal",
    "لينة": "Lina",
    "وليد": "Walid",
    "لويزة": "Louiza",
    "سعيد": "Said",
    "احلام": "Ahlem",
    "أحلام": "Ahlem",
    "حليمة": "Halima",
    "زليخة": "Zouleikha",
    "صبرينة": "Sabrina",
    "سفيان": "Sofiane",
    "سامية": "Samia",
    "نورة": "Noura",
    "حكيمة": "Hakima",
    "كوثر": "Kawther",
    "فطومة": "Fattouma",
    "مليكة": "Malika",
    "هاجر": "Hadjer",
    "ايمن": "Aimen",
    "أيمن": "Aimen",
    "ايمان": "Imane",
    "مريم": "Meriem",
    "عبد الرحمان": "Abderrahmane",
    "عبد الرحمن": "Abderrahmane",
    "عبد الرحمن": "Abderrahmane",
    "عبد القادر": "Abdelkader",
    "عبد المالك": "Abdelmalek",
    "عبد الله": "Abdallah",
    "صلاح الدين": "Salaheddine",
    "محمد امين": "Mohamed Amine",
    "محمد أمين": "Mohamed Amine",
    "محمد رسيم": "Mohamed Racim",
    "محمد عمر": "Mohamed Omar",
    "عيسى ابراهيم": "Aissa Ibrahim",
    "زياد امير": "Ziad Amir",
    "محمد امير": "Mohamed Amir",
    "فتيمة": "Fatima",
    "إسراء": "Isra",
    "اسراء": "Isra",
    "جهاد": "Djihad",
    "جنى": "Jana",
    "جنى": "Jana",
    "تسنيم": "Tesnim",
    "تسنيم": "Tesnim",
    "اياد": "Iyad",
    "إياد": "Iyad",
    "ايهم": "Ayhem",
    "سجى": "Saja",
    "سجى": "Saja",
    "دانا": "Dana",
    "دانية": "Dania",
    "دانيا": "Dania",
    "لؤي": "Louay",
    "لؤي": "Louay",
    "ايلاف": "Elaf",
    "إيلاف": "Elaf",
    "رسل": "Rassel",
    "غفران": "Ghofran",
    "جويرية": "Jouairia",
    "جويريه": "Jouairia",
    "بتول": "Batoul",
    "مهدي": "Mehdi",
    "مهى": "Maha",
    "مها": "Maha",
    "رؤى": "Roua",
    "رؤى": "Roua",
    "ايهاب": "Ihab",
    "إيهاب": "Ihab",
    "باسم": "Bassem",
    "ياسر": "Yasser",
    "ياسمين": "Yasmine",
    "زهراء": "Zahra",
    "زهرة": "Zahra",
    "زينب": "Zineb",
    "زين الدين": "Zineddine",
    "زين الدين": "Zineddine",
    "عبد الرزاق": "Abderrezak",
    "مراد": "Mourad",
    "نسيم": "Nassim",
    "نسيمة": "Nassima",
    "لطيفة": "Latifa",
    "وردية": "Ouardia",
    "وردة": "Ouarda",
    "شافية": "Chafia",
    "شهرزاد": "Chehrazad",
    "دليلة": "Dalila",
    "جميلة": "Djamila",
    "فضيلة": "Fadhila",
    "نورة": "Noura",
    "نورهان": "Nourhane",
    "ايسر": "Aisser",
    "أيسر": "Aisser",
}

# Family / surnames Arabic → Latin (common Algerian)
FAMILY_AR2LAT = {
    "عيد": "Aid",
    "عاشور": "Achour",
    "حليمي": "Halimi",
    "بوشابو": "Bouchabou",
    "جوادي": "Djouadi",
    "عمران": "Omrane",
    "حاج": "Hadj",
    "سعداوي": "Saadaoui",
    "النصيرات": "Ennasseirat",
    "أمالو": "Ammalou",
    "امالو": "Ammalou",
    "بن يخلف": "Ben Yekhlef",
    "يخلف": "Yekhlef",
    "بلقاسم": "Belkacem",
    "بلقاسمي": "Belkacemi",
    "براهيمي": "Brahimi",
    "زيتوني": "Zitouni",
    "قطاري": "Gattari",
    "منصوري": "Mansouri",
    "شرفي": "Cherfi",
    "ناجي": "Nadji",
    "رامول": "Ramoul",
    "يوسفي": "Youcefi",
    "عماري": "Ammari",
    "قرابة": "Graba",
    "رحماني": "Rahmani",
    "طيبي": "Taibi",
    "طايبي": "Taibi",
    "بن طالب": "Ben Taleb",
    "طالب": "Taleb",
    "بوعزة": "Bouazza",
    "موساوي": "Moussaoui",
    "يحياوي": "Yahiaoui",
    "طرابلسي": "Trablsi",
    "تومي": "Toumi",
    "علواش": "Allouache",
    "دحماني": "Dahmani",
    "النعيمي": "Ennaimi",
    "ايت": "Ait",
    "بورقعة": "Bourkaa",
    "بورمة": "Bourma",
    "بوزورين": "Bouzourine",
    "بوغرارة": "Boughrara",
    "بولخطام": "Boulkhatem",
    "حمدان": "Hamdane",
    "حموم": "Hammoum",
    "خايطي": "Khaiti",
    "دراجي": "Derraji",
    "درامشي": "Dramchi",
    "دقاش": "Dekkache",
    "رمضان": "Ramdane",
    "زابي": "Zabi",
    "زاوشي": "Zaouchi",
    "زيدان": "Zidane",
    "زيراوي": "Ziraoui",
    "شاطر": "Chater",
    "شتال": "Chetal",
    "صجاجي": "Sedjadji",
    "صجروب": "Sedjeroub",
    "صحراوي": "Sahraoui",
    "صحكي": "Sehki",
    "عبو": "Abbou",
    "عربوش": "Arabeuche",
    "علالو": "Allalou",
    "عليوة": "Alioua",
    "فتحي": "Fethi",
    "كرايرية": "Kerairia",
    "لعلاوي": "Lalaoui",
    "لعويرة": "Laouira",
    "مازوني": "Mazouni",
    "محمود": "Mahmoud",
    "مخازني": "Mekhazni",
    "مريمش": "Merimeche",
    "مرابط": "Merabet",
    "وادي": "Ouadi",
    "العباسي": "El Abbassi",
    "ايت عمر": "Ait Omar",
    "برغوثي": "Barghouthi",
    "بلعزوقي": "Belazouki",
    "بلعيد": "Belaid",
    "بن دكون": "Ben Dekkoun",
    "بن شريف": "Ben Cherif",
    "بن عمارة": "Ben Amara",
    "بن منصور": "Ben Mansour",
    "بوليان": "Bouliane",
    "جحنين": "Djehnine",
    "جعفر شريف": "Djaafer Cherif",
    "حشاني": "Hachani",
    "خلفة": "Khelfa",
    "دادو": "Dadou",
    "داود": "Daoud",
    "دزيري": "Deziri",
    "دلاشي": "Dellachi",
    "ديكماش": "Dikmache",
    "روابي": "Rouabi",
    "زندي": "Zendi",
    "ساعد": "Saad",
    "سامر": "Samer",
    "شرفاوي": "Cherfaoui",
    "شمون": "Chemoun",
    "شنوف": "Chenouf",
    "صفصاف": "Sefsafa",
    "طوطاوي": "Toutaoui",
    "عون الله": "Aounallah",
    "غوتي": "Ghouti",
    "قاسي": "Kaci",
    "كلال": "Kellal",
    "لطرش": "Latreche",
    "مالكي": "Melki",
    "نجاري": "Nedjari",
    "الخربة": "El Kherba",
    "الهان": "Elhane",
    "انزار": "Anzar",
    "اوعمري": "Ouamri",
    "بختي": "Bekhti",
    "بديار": "Bediare",
    "بكليون": "Beklioune",
    "بن صالح": "Ben Salah",
    "بن قاسي": "Ben Kaci",
    "بن ناصر": "Ben Nacer",
    "بن نجمة": "Ben Nedjma",
    "بوحوس": "Bouhous",
    "بوربالة": "Bourbala",
}


# --- auto-expanded common given names ---
GIVEN_AR2LAT.update({
    'جاد': 'Jad',
    'يحيى': 'Yahia',
    'يحيي': 'Yahia',
    'رحمة': 'Rahma',
    'ندى': 'Nada',
    'ندي': 'Nada',
    'خليل': 'Khalil',
    'هارون': 'Haroun',
    'اسكندر': 'Iskander',
    'إسكندر': 'Iskander',
    'اميرة': 'Amira',
    'أميرة': 'Amira',
    'سيدرة': 'Sidra',
    'دارين': 'Darine',
    'كاميليا': 'Camelia',
    'ملينة': 'Melina',
    'معاذ': 'Mouad',
    'هبة': 'Hiba',
    'مرام': 'Maram',
    'تامر': 'Tamer',
    'ريتاج': 'Ritaj',
    'سعد': 'Saad',
    'موسى': 'Moussa',
    'موسي': 'Moussa',
    'اكرم': 'Akram',
    'أكرم': 'Akram',
    'جمانة': 'Djoumana',
    'ايلين': 'Ailine',
    'إيلين': 'Ailine',
    'ليتيسيا': 'Laetitia',
    'سيليا': 'Celia',
    'ليا': 'Lia',
    'رياض': 'Riad',
    'وائل': 'Wael',
    'طه': 'Taha',
    'حمزة': 'Hamza',
    'جودي': 'Judy',
    'سيلين': 'Celine',
    'رنيم': 'Ranim',
    'أليسيا': 'Alicia',
    'اليسيا': 'Alicia',
    'سرين': 'Serine',
    'أيوب': 'Ayoub',
    'ايوب': 'Ayoub',
    'دينا': 'Dina',
    'رزان': 'Razan',
    'ادريس': 'Idriss',
    'إدريس': 'Idriss',
    'تاليا': 'Talia',
    'انيا': 'Anya',
    'رهف': 'Rahaf',
    'سراج': 'Siradj',
    'جود': 'Joud',
    'عفيف': 'Afif',
    'أسيل': 'Assil',
    'اسيل': 'Assil',
    'مولاي': 'Moulay',
    'بشرى': 'Bouchra',
    'بشري': 'Bouchra',
    'ميرة': 'Mira',
    'هيثم': 'Haythem',
    'ليديا': 'Lidia',
    'الاء': 'Alaa',
    'آلاء': 'Alaa',
    'سليمان': 'Slimane',
    'عماد': 'Imad',
    'جنة': 'Djenna',
    'جنه': 'Djenna',
    'مليك': 'Malek',
    'صالح': 'Salah',
    'حمادة': 'Hamada',
    'ايلاف': 'Elaf',
    'ريتال': 'Rital',
    'لينا': 'Lina',
    'عبد الرزاق': 'Abderrezak',
    'عبد السلام': 'Abdessalam',
    'عبد الرؤوف': 'Abderraouf',
    'عبد الرءوف': 'Abderraouf',
    'نور الدين': 'Noureddine',
    'صلاح الدين': 'Salaheddine',
    'عز الدين': 'Azzeddine',
    'شمس الدين': 'Chemseddine',
    'سيف الدين': 'Seifeddine',
    'بدر الدين': 'Bedreddine',
    'محمودي': 'Mahmoudi',
})


FAMILY_AR2LAT.update({
    'قارة': 'Kara',
    'زرقي': 'Zerki',
    'مزياني': 'Meziani',
    'زروق': 'Zerrouk',
    'رزايقية': 'Rezaiguia',
    'حساني': 'Hassani',
    'بودوارة': 'Boudouara',
    'مسعودي': 'Messaoudi',
    'حمتين': 'Hemtine',
    'عيساوي': 'Aissaoui',
    'بوثلجة': 'Bouteldja',
    'بوسيس': 'Boussis',
    'بالله': 'Bellah',
})

# Latin → Arabic for teachers / reverse
GIVEN_LAT2AR = {
    "aimen": "أيمن",
    "aimene": "أيمن",
    "maria": "ماريا",
    "merina": "مرينا",
    "yasmine": "ياسمين",
    "zohor": "زهور",
    "zohra": "زهرة",
    "fella": "فلة",
    "manel": "منال",
    "achour": "عاشور",
    "lynda": "ليندا",
    "hanene": "حنان",
    "aicha": "عائشة",
    "hadjer": "هاجر",
    "rayane": "ريان",
    "zineddine": "زين الدين",
    "asma": "أسماء",
    "ibtissem": "ابتسام",
    "sarah": "سارة",
    "sara": "سارة",
    "douniazed": "دنيا زاد",
    "basma": "بسمة",
    "naima": "نعيمة",
    "razika": "رزيقة",
    "fares": "فارس",
    "fatiha": "فتيحة",
    "amel": "آمال",
    "abla": "عبلة",
    "nadjat": "نجاة",
    "nadjet": "نجاة",
    "khadidja": "خديجة",
    "rabia": "ربيعة",
    "chaima": "شيماء",
    "ikram": "إكرام",
    "akram": "أكرم",
    "meriem": "مريم",
    "bachira": "بشيرة",
    "marwa": "مروى",
    "farah": "فرح",
    "fatima": "فاطمة",
    "fatma": "فاطمة",
    "hanane": "حنان",
    "kamal": "كمال",
    "kmel": "كمال",
    "oussama": "أسامة",
    "asama": "أسامة",
    "lina": "لينة",
    "louiza": "لويزة",
    "walid": "وليد",
    "oulid": "وليد",
    "said": "سعيد",
    "wissam": "وسام",
    "ousam": "وسام",
    "ahmed": "أحمد",
    "ahmd": "أحمد",
    "salaheddine": "صلاح الدين",
    "ahlem": "أحلام",
    "ahlam": "أحلام",
    "halima": "حليمة",
    "hlima": "حليمة",
    "zouleikha": "زليخة",
    "zlikha": "زليخة",
    "sabrina": "صبرينة",
    "sbrina": "صبرينة",
    "sofiane": "سفيان",
    "sfian": "سفيان",
    "mohamed": "محمد",
    "mhmd": "محمد",
    "amine": "أمين",
    "amin": "أمين",
    "samia": "سامية",
    "noura": "نورة",
    "samira": "سميرة",
    "smira": "سميرة",
    "salim": "سليم",
    "slim": "سليم",
    "hakima": "حكيمة",
    "hkima": "حكيمة",
    "kawther": "كوثر",
    "kouthr": "كوثر",
    "fattouma": "فطومة",
    "ftouma": "فطومة",
    "malika": "مليكة",
    "mlika": "مليكة",
    "imane": "إيمان",
    "aiman": "إيمان",
    "anis": "أنيس",
    "abdelkader": "عبد القادر",
    "abderrahmane": "عبد الرحمان",
    "abdelmalek": "عبد المالك",
    "omar": "عمر",
    "amr": "عمر",
}

FAMILY_LAT2AR = {
    "adda": "عدة",
    "ait ameur": "آيت عمر",
    "ammari": "عماري",
    "bach": "باش",
    "bachari": "بشاري",
    "baraka": "بركة",
    "belaidi": "بلعيدي",
    "belharizi": "بلهاريزي",
    "ben moussa": "بن موسى",
    "boualem": "بوعلام",
    "briki": "بريكي",
    "chennouga": "شنوقة",
    "chergui": "شرقي",
    "cherif": "شريف",
    "cherrad": "شراد",
    "dahabi": "ذهبي",
    "djenadi": "جنادي",
    "djouati": "جواتي",
    "gheras": "غراس",
    "hadj abderrahmane": "حاج عبد الرحمان",
    "hamidi": "حميدي",
    "harnene": "حرنان",
    "hassani": "حسني",
    "ikenou": "إكنو",
    "kassa": "قاسة",
    "kellal": "كلال",
    "kourane": "قوران",
    "leulmi": "لعلمي",
    "louli": "لولي",
    "mazzouni": "مزوني",
    "messah": "مساح",
    "miloudi": "ميلودي",
    "ouhada": "أوحدة",
    "oussar": "أوسار",
    "rebhaoui": "ربحوي",
    "sifouane": "صفوان",
    "silmi": "سلمي",
    "ternish": "ترنيش",
    "zerrouk": "زروق",
}


def norm_ar(s: str) -> str:
    s = unicodedata.normalize("NFKC", s or "").strip()
    s = s.replace("أ", "ا").replace("إ", "ا").replace("آ", "ا")
    s = s.replace("ة", "ه")
    s = s.replace("ى", "ي")
    s = re.sub(r"[\u064B-\u065F\u0670]", "", s)  # harakat
    s = s.replace("ـ", "")
    return s


def title_lat(s: str) -> str:
    if not s:
        return ""
    parts = []
    for p in s.split():
        if p.lower() in {"ben", "bent", "ibn", "el", "al", "ait", "ouled", "ould", "sidi"}:
            parts.append(p[:1].upper() + p[1:].lower())
        elif "-" in p:
            parts.append("-".join(title_lat(x) if x else x for x in p.split("-")))
        else:
            parts.append(p[:1].upper() + p[1:].lower() if p.isalpha() else p)
    return " ".join(parts)


def letter_ar_to_lat(token: str) -> str:
    """Fallback Maghrebi French-style letter map — last resort only."""
    digraphs = [
        ("عبدال", "Abdel"),
        ("الش", "Ech"),
        ("ال", "El"),
        ("خ", "kh"),
        ("غ", "gh"),
        ("ش", "ch"),
        ("ث", "th"),
        ("ذ", "dh"),
        ("ظ", "dh"),
        ("ص", "s"),
        ("ض", "d"),
        ("ط", "t"),
        ("ق", "k"),
        ("ج", "dj"),
        ("ح", "h"),
        ("ع", "a"),
        ("ء", ""),
        ("ؤ", "ou"),
        ("ئ", "i"),
        ("و", "ou"),
        ("ي", "i"),
        ("ا", "a"),
        ("ب", "b"),
        ("ت", "t"),
        ("د", "d"),
        ("ر", "r"),
        ("ز", "z"),
        ("س", "s"),
        ("ف", "f"),
        ("ك", "k"),
        ("ل", "l"),
        ("م", "m"),
        ("ن", "n"),
        ("ه", "h"),
        ("ة", "a"),
        ("ى", "a"),
    ]
    out = []
    i = 0
    text = token
    while i < len(text):
        matched = False
        for src, dst in digraphs:
            if text.startswith(src, i):
                out.append(dst)
                i += len(src)
                matched = True
                break
        if not matched:
            ch = text[i]
            if not AR_RE.search(ch):
                out.append(ch)
            i += 1
    raw = "".join(out)
    raw = re.sub(r"([aeiou])\1{2,}", r"\1\1", raw, flags=re.I)
    return title_lat(raw)


def ar_token_to_lat(token: str, kind: str = "given") -> tuple[str, bool]:
    """Return (latin, known)."""
    t = token.strip()
    if not t:
        return "", True
    if not AR_RE.search(t):
        return title_lat(t), True
    if t in PARTICLES_AR:
        return PARTICLES_AR[t], True
    if t in GIVEN_AR2LAT:
        return GIVEN_AR2LAT[t], True
    if t in FAMILY_AR2LAT:
        return FAMILY_AR2LAT[t], True
    # try normalized dictionary keys
    n = norm_ar(t)
    for d in (GIVEN_AR2LAT, FAMILY_AR2LAT, PARTICLES_AR):
        for k, v in d.items():
            if norm_ar(k) == n:
                return v, True
    return letter_ar_to_lat(t), False


def ar_phrase_to_lat(phrase: str, kind: str = "given") -> tuple[str, list[str]]:
    phrase = (phrase or "").strip()
    if not phrase:
        return "", []
    # whole-phrase dictionary first
    if phrase in GIVEN_AR2LAT:
        return GIVEN_AR2LAT[phrase], []
    if phrase in FAMILY_AR2LAT:
        return FAMILY_AR2LAT[phrase], []
    nphrase = norm_ar(phrase)
    for d in (GIVEN_AR2LAT, FAMILY_AR2LAT):
        for k, v in d.items():
            if norm_ar(k) == nphrase:
                return v, []

    # عبد + name compounds
    if phrase.startswith("عبد"):
        rest = phrase[3:].lstrip()
        fused = {
            "الرحمان": "Abderrahmane",
            "الرحمن": "Abderrahmane",
            "القادر": "Abdelkader",
            "المالك": "Abdelmalek",
            "الله": "Abdallah",
            "الرزاق": "Abderrezak",
            "العزيز": "Abdelaziz",
            "الوهاب": "Abdelwahab",
            "الحميد": "Abdelhamid",
            "الكريم": "Abdelkrim",
            "النور": "Abdennour",
            "السلام": "Abdessalam",
            "الرؤوف": "Abderraouf",
            "الرءوف": "Abderraouf",
            "الحق": "Abdelhak",
            "اللطيف": "Abdellatif",
            "المجيد": "Abdelmadjid",
            "الودود": "Abdeloudoud",
        }
        if rest in fused:
            return fused[rest], []
        for k, v in fused.items():
            if norm_ar(k) == norm_ar(rest):
                return v, []
        # عبد + remainder phrase
        if rest:
            lat_rest, unk = ar_phrase_to_lat(rest, kind)
            return (f"Abdel {lat_rest}".strip(), unk)

    # X الدين compounds
    if phrase.endswith(" الدين") or phrase.endswith("الدين"):
        base = phrase[: -len(" الدين")] if phrase.endswith(" الدين") else phrase[: -len("الدين")]
        base = base.strip()
        din = {
            "نور": "Noureddine",
            "صلاح": "Salaheddine",
            "عز": "Azzeddine",
            "شمس": "Chemseddine",
            "سيف": "Seifeddine",
            "بدر": "Bedreddine",
            "علاء": "Alaeddine",
            "علا": "Alaeddine",
            "فخر": "Fakhreddine",
            "محي": "Mohieddine",
            "زين": "Zineddine",
        }
        if base in din:
            return din[base], []
        for k, v in din.items():
            if norm_ar(k) == norm_ar(base):
                return v, []

    unknown = []
    parts = []
    tokens = phrase.split()
    i = 0
    while i < len(tokens):
        matched = False
        for n in (3, 2, 1):
            if i + n > len(tokens):
                continue
            chunk = " ".join(tokens[i : i + n])
            if chunk in GIVEN_AR2LAT or chunk in FAMILY_AR2LAT or chunk in PARTICLES_AR:
                lat, known = ar_token_to_lat(chunk, kind)
                parts.append(lat)
                if not known:
                    unknown.append(chunk)
                i += n
                matched = True
                break
            nchunk = norm_ar(chunk)
            hit = None
            for d in (GIVEN_AR2LAT, FAMILY_AR2LAT, PARTICLES_AR):
                for k, v in d.items():
                    if norm_ar(k) == nchunk:
                        hit = v
                        break
                if hit:
                    break
            if hit:
                parts.append(hit)
                i += n
                matched = True
                break
        if matched:
            continue
        lat, known = ar_token_to_lat(tokens[i], kind)
        parts.append(lat)
        if not known:
            unknown.append(tokens[i])
        i += 1
    return " ".join(p for p in parts if p), unknown


def fix_abdel(s: str) -> str:
    # "Abdel Kader" → "Abdelkader" for common fused forms when second is short
    s = re.sub(r"\bAbdel\s+Kader\b", "Abdelkader", s, flags=re.I)
    s = re.sub(r"\bAbdel\s+Rahmane\b", "Abderrahmane", s, flags=re.I)
    s = re.sub(r"\bAbdel\s+Malek\b", "Abdelmalek", s, flags=re.I)
    s = re.sub(r"\bAbdel\s+Kadr\b", "Abdelkader", s, flags=re.I)
    s = re.sub(r"\bAbdel\s+Rhmn\b", "Abderrahmane", s, flags=re.I)
    return s


def latin_parts_from_ar(first: str, last: str, full: str) -> tuple[str, str, str, list[str]]:
    unk = []
    fl, u1 = ar_phrase_to_lat(first, "given")
    ll, u2 = ar_phrase_to_lat(last, "family")
    unk.extend(u1)
    unk.extend(u2)
    fl = fix_abdel(title_lat(fl))
    ll = fix_abdel(title_lat(ll))
    if fl or ll:
        # EN/FR display order: First Last
        full_l = fix_abdel(title_lat(f"{fl} {ll}".strip()))
    else:
        full_l, u3 = ar_phrase_to_lat(full, "given")
        unk.extend(u3)
        full_l = fix_abdel(title_lat(full_l))
        # try split full arabic "Last First" → already handled via first/last
    return fl, ll, full_l, unk


def lat_token_to_ar(token: str) -> tuple[str, bool]:
    t = (token or "").strip()
    if not t:
        return "", True
    if AR_RE.search(t):
        return t, True
    key = t.lower().strip()
    if key in GIVEN_LAT2AR:
        return GIVEN_LAT2AR[key], True
    if key in FAMILY_LAT2AR:
        return FAMILY_LAT2AR[key], True
    return t, False  # keep Latin if unknown rather than inventing wrong Arabic


def latin_phrase_to_ar(phrase: str) -> tuple[str, list[str]]:
    phrase = (phrase or "").strip()
    if not phrase:
        return "", []
    if AR_RE.search(phrase):
        return phrase, []
    key = re.sub(r"\s+", " ", phrase.lower().strip())
    if key in GIVEN_LAT2AR:
        return GIVEN_LAT2AR[key], []
    if key in FAMILY_LAT2AR:
        return FAMILY_LAT2AR[key], []
    unknown = []
    parts = []
    tokens = phrase.split()
    i = 0
    while i < len(tokens):
        matched = False
        for n in (4, 3, 2, 1):
            if i + n <= len(tokens):
                chunk = " ".join(tokens[i : i + n])
                k = chunk.lower()
                if k in GIVEN_LAT2AR:
                    parts.append(GIVEN_LAT2AR[k])
                    i += n
                    matched = True
                    break
                if k in FAMILY_LAT2AR:
                    parts.append(FAMILY_LAT2AR[k])
                    i += n
                    matched = True
                    break
        if matched:
            continue
        ar, known = lat_token_to_ar(tokens[i])
        parts.append(ar)
        if not known:
            unknown.append(tokens[i])
        i += 1
    return " ".join(parts), unknown


def split_teacher_latin(t: dict) -> tuple[str, str]:
    fn = (t.get("firstName") or "").strip()
    ln = (t.get("lastName") or "").strip()
    latin = (t.get("nameLatin") or "").strip()
    if AR_RE.search(fn + ln):
        # names currently Arabic — latinize later
        return fn, ln
    if fn or ln:
        return fn, ln
    # only last-name style in nameLatin / lastName
    if latin:
        parts = latin.split()
        if len(parts) == 1:
            return "", parts[0]
        return parts[0], " ".join(parts[1:])
    return "", ""


def main() -> None:
    data = json.loads(DATA.read_text(encoding="utf-8"))
    unknown_ar: dict[str, int] = {}
    unknown_lat: dict[str, int] = {}
    student_updates = 0
    teacher_updates = 0

    # Students
    for dept_key in ("primary", "middle"):
        for level in data[dept_key]["levels"]:
            for cls in level["classes"]:
                for s in cls["students"]:
                    first = (s.get("firstName") or "").strip()
                    last = (s.get("lastName") or "").strip()
                    full = (s.get("fullName") or f"{last} {first}").strip()
                    # Ensure Arabic stored (already is)
                    fl, ll, full_l, unk = latin_parts_from_ar(first, last, full)
                    for u in unk:
                        unknown_ar[u] = unknown_ar.get(u, 0) + 1
                    s["firstNameLatin"] = fl
                    s["lastNameLatin"] = ll
                    s["fullNameLatin"] = full_l
                    s["searchName"] = " ".join(
                        filter(None, [full, full_l, first, fl, last, ll])
                    )
                    student_updates += 1

    # Teachers
    for t in data.get("teachers", []):
        fn_raw = (t.get("firstName") or "").strip()
        ln_raw = (t.get("lastName") or "").strip()
        latin_raw = (t.get("nameLatin") or "").strip()

        has_arabic = AR_RE.search(fn_raw + ln_raw)
        has_latin_fields = LAT_RE.search(fn_raw + ln_raw + latin_raw)

        if has_arabic:
            # Arabic source → correct Latin
            fl, ll, full_l, unk = latin_parts_from_ar(fn_raw, ln_raw, f"{ln_raw} {fn_raw}".strip())
            for u in unk:
                unknown_ar[u] = unknown_ar.get(u, 0) + 1
            t["firstName"] = fn_raw
            t["lastName"] = ln_raw
            t["firstNameLatin"] = fl
            t["lastNameLatin"] = ll
            t["nameLatin"] = full_l or title_lat(latin_raw) or f"{fl} {ll}".strip()
        else:
            # Latin source → produce Arabic + normalize Latin
            fn_lat, ln_lat = split_teacher_latin(t)
            if not fn_lat and not ln_lat and latin_raw:
                parts = latin_raw.split()
                fn_lat, ln_lat = (parts[0], " ".join(parts[1:])) if len(parts) > 1 else ("", parts[0])
            fn_lat = title_lat(fn_lat)
            ln_lat = title_lat(ln_lat)
            # Prefer ALLCAPS family names as family
            if fn_lat.isupper() and not ln_lat:
                ln_lat, fn_lat = fn_lat.title(), ""
            ar_fn, u1 = latin_phrase_to_ar(fn_lat)
            ar_ln, u2 = latin_phrase_to_ar(ln_lat)
            for u in u1 + u2:
                unknown_lat[u] = unknown_lat.get(u, 0) + 1
            # Store Arabic in first/last for AR UI; Latin in nameLatin + *Latin fields
            if ar_fn or ar_ln:
                t["firstName"] = ar_fn
                t["lastName"] = ar_ln
            else:
                # keep original latin in first/last if we couldn't translate — still set nameLatin
                t["firstName"] = fn_raw or fn_lat
                t["lastName"] = ln_raw or ln_lat
            full_l = title_lat(f"{fn_lat} {ln_lat}".strip() or latin_raw)
            t["firstNameLatin"] = fn_lat
            t["lastNameLatin"] = ln_lat
            t["nameLatin"] = full_l
        teacher_updates += 1

    DATA.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # Report
    lines = []
    lines.append(f"Students updated: {student_updates}")
    lines.append(f"Teachers updated: {teacher_updates}")
    lines.append("\n=== Unknown Arabic tokens (fallback letter-map used) ===")
    for k, c in sorted(unknown_ar.items(), key=lambda x: -x[1])[:80]:
        lines.append(f"{c:4d}  {k}")
    lines.append("\n=== Unknown Latin tokens (Arabic left as Latin source) ===")
    for k, c in sorted(unknown_lat.items(), key=lambda x: -x[1])[:80]:
        lines.append(f"{c:4d}  {k}")
    # samples
    lines.append("\n=== Student samples ===")
    for s in data["primary"]["levels"][0]["classes"][0]["students"][:8]:
        lines.append(f"{s['fullName']}  ↔  {s['fullNameLatin']}")
    lines.append("\n=== Teacher samples ===")
    for t in data["teachers"][:12]:
        lines.append(
            f"AR: {(t.get('firstName') or '')} {(t.get('lastName') or '')}  |  LAT: {t.get('nameLatin')}"
        )
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines[:40]))
    print(f"\nFull report: {REPORT}")
    print(f"Unknown AR tokens: {len(unknown_ar)} | Unknown LAT tokens: {len(unknown_lat)}")


if __name__ == "__main__":
    main()
