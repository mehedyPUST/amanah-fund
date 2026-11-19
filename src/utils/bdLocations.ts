import type { StructuredBdAddress } from '../types/coop.ts';

export interface BdDistrictData {
  name: string;
  upazilas: string[];
}

export interface BdDivisionData {
  name: string;
  districts: BdDistrictData[];
}

/**
 * Bangladesh Teletalk-style administrative hierarchy:
 * 8 Divisions -> 64 Districts -> Official Upazilas / Metropolitan Thanas.
 */
export const BD_DIVISIONS: BdDivisionData[] = [
  {
    name: 'Dhaka',
    districts: [
      {
        name: 'Dhaka',
        upazilas: [
          'Adabor',
          'Badda',
          'Banani',
          'Bangshal',
          'Bimanbandar',
          'Cantonment',
          'Chawkbazar',
          'Dakshinkhan',
          'Darus Salam',
          'Demra',
          'Dhamrai',
          'Dhanmondi',
          'Dohar',
          'Gendaria',
          'Gulshan',
          'Hazaribagh',
          'Jatrabari',
          'Kadamtali',
          'Kafrul',
          'Kalabagan',
          'Kamrangirchar',
          'Keraniganj',
          'Khilgaon',
          'Khilkhet',
          'Kotwali',
          'Lalbagh',
          'Mirpur Model',
          'Mohammadpur',
          'Motijheel',
          'Mugda',
          'Nawabganj',
          'New Market',
          'Pallabi',
          'Paltan',
          'Ramna',
          'Rampura',
          'Rupnagar',
          'Sabujbagh',
          'Savar',
          'Shah Ali',
          'Shahbagh',
          'Shahjahanpur',
          'Sher-e-Bangla Nagar',
          'Shyampur',
          'Sutrapur',
          'Tejgaon',
          'Tejgaon Industrial Area',
          'Turag',
          'Uttara East',
          'Uttara West',
          'Uttarkhan',
          'Vatara',
          'Wari',
        ],
      },
      {
        name: 'Faridpur',
        upazilas: [
          'Alfadanga',
          'Bhanga',
          'Boalmari',
          'Charbhadrasan',
          'Faridpur Sadar',
          'Madhukhali',
          'Nagarkanda',
          'Sadarpur',
          'Saltha',
        ],
      },
      {
        name: 'Gazipur',
        upazilas: [
          'Gazipur Sadar',
          'Kaliakair',
          'Kaliganj',
          'Kapasia',
          'Sreepur',
          'Tongi East',
          'Tongi West',
        ],
      },
      {
        name: 'Gopalganj',
        upazilas: ['Gopalganj Sadar', 'Kashiani', 'Kotalipara', 'Muksudpur', 'Tungipara'],
      },
      {
        name: 'Kishoreganj',
        upazilas: [
          'Austagram',
          'Bajitpur',
          'Bhairab',
          'Hossainpur',
          'Itna',
          'Karimganj',
          'Katiadi',
          'Kishoreganj Sadar',
          'Kuliarchar',
          'Mithamain',
          'Nikli',
          'Pakundia',
          'Tarail',
        ],
      },
      {
        name: 'Madaripur',
        upazilas: ['Dasar', 'Kalkini', 'Madaripur Sadar', 'Rajoir', 'Shibchar'],
      },
      {
        name: 'Manikganj',
        upazilas: [
          'Daulatpur',
          'Ghior',
          'Harirampur',
          'Manikganj Sadar',
          'Saturia',
          'Shivalaya',
          'Singair',
        ],
      },
      {
        name: 'Munshiganj',
        upazilas: [
          'Gazaria',
          'Lohajang',
          'Munshiganj Sadar',
          'Sirajdikhan',
          'Sreenagar',
          'Tongibari',
        ],
      },
      {
        name: 'Narayanganj',
        upazilas: [
          'Araihazar',
          'Bandar',
          'Fatullah',
          'Narayanganj Sadar',
          'Rupganj',
          'Siddhirganj',
          'Sonargaon',
        ],
      },
      {
        name: 'Narsingdi',
        upazilas: ['Belabo', 'Monohardi', 'Narsingdi Sadar', 'Palash', 'Raipura', 'Shibpur'],
      },
      {
        name: 'Rajbari',
        upazilas: ['Baliakandi', 'Goalandaghat', 'Kalukhali', 'Pangsha', 'Rajbari Sadar'],
      },
      {
        name: 'Shariatpur',
        upazilas: ['Bhedarganj', 'Damudya', 'Gosairhat', 'Naria', 'Shariatpur Sadar', 'Zanjira'],
      },
      {
        name: 'Tangail',
        upazilas: [
          'Basail',
          'Bhuapur',
          'Delduar',
          'Dhanbari',
          'Ghatail',
          'Gopalpur',
          'Kalihati',
          'Madhupur',
          'Mirzapur',
          'Nagarpur',
          'Sakhipur',
          'Tangail Sadar',
        ],
      },
    ],
  },
  {
    name: 'Chattogram',
    districts: [
      {
        name: 'Bandarban',
        upazilas: [
          'Alikadam',
          'Bandarban Sadar',
          'Lama',
          'Naikhongchhari',
          'Rowangchhari',
          'Ruma',
          'Thanchi',
        ],
      },
      {
        name: 'Brahmanbaria',
        upazilas: [
          'Akhaura',
          'Ashuganj',
          'Bancharampur',
          'Bijoynagar',
          'Brahmanbaria Sadar',
          'Kasba',
          'Nabinagar',
          'Nasirnagar',
          'Sarail',
        ],
      },
      {
        name: 'Chandpur',
        upazilas: [
          'Chandpur Sadar',
          'Faridganj',
          'Haimchar',
          'Haziganj',
          'Kachua',
          'Matlab North',
          'Matlab South',
          'Shahrasti',
        ],
      },
      {
        name: 'Chattogram',
        upazilas: [
          'Akbarshah',
          'Anwara',
          'Bakalia',
          'Bandar',
          'Banshkhali',
          'Bayezid Bostami',
          'Boalkhali',
          'Chandanaish',
          'Chandgaon',
          'Chawkbazar',
          'Double Mooring',
          'EPZ',
          'Fatikchhari',
          'Halishahar',
          'Hathazari',
          'Karnaphuli',
          'Khulshi',
          'Kotwali',
          'Lohagara',
          'Mirsharai',
          'Pahartali',
          'Panchlaish',
          'Patenga',
          'Patiya',
          'Rangunia',
          'Raozan',
          'Sadarghat',
          'Sandwip',
          'Satkania',
          'Sitakunda',
        ],
      },
      {
        name: 'Comilla',
        upazilas: [
          'Barura',
          'Brahmanpara',
          'Burichang',
          'Chandina',
          'Chauddagram',
          'Comilla Adarsha Sadar',
          'Comilla Sadar Dakshin',
          'Daudkandi',
          'Debidwar',
          'Homna',
          'Laksam',
          'Lalmai',
          'Meghna',
          'Monohorgonj',
          'Muradnagar',
          'Nangalkot',
          'Titas',
        ],
      },
      {
        name: "Cox's Bazar",
        upazilas: [
          'Chakaria',
          "Cox's Bazar Sadar",
          'Eidgaon',
          'Kutubdia',
          'Maheshkhali',
          'Pekua',
          'Ramu',
          'Teknaf',
          'Ukhia',
        ],
      },
      {
        name: 'Feni',
        upazilas: ['Chhagalnaiya', 'Daganbhuiyan', 'Feni Sadar', 'Fulgazi', 'Parshuram', 'Sonagazi'],
      },
      {
        name: 'Khagrachhari',
        upazilas: [
          'Dighinala',
          'Guimara',
          'Khagrachhari Sadar',
          'Lakshmichhari',
          'Mahalchhari',
          'Manikchhari',
          'Matiranga',
          'Panchhari',
          'Ramgarh',
        ],
      },
      {
        name: 'Lakshmipur',
        upazilas: ['Kamalnagar', 'Lakshmipur Sadar', 'Raipur', 'Ramganj', 'Ramgati'],
      },
      {
        name: 'Noakhali',
        upazilas: [
          'Begumganj',
          'Chatkhil',
          'Companiganj',
          'Hatiya',
          'Kabirhat',
          'Noakhali Sadar',
          'Senbagh',
          'Sonaimuri',
          'Subarnachar',
        ],
      },
      {
        name: 'Rangamati',
        upazilas: [
          'Baghaichhari',
          'Barkal',
          'Belaichhari',
          'Juraichhari',
          'Kaptai',
          'Kawkhali',
          'Langadu',
          'Naniarchar',
          'Rajasthali',
          'Rangamati Sadar',
        ],
      },
    ],
  },
  {
    name: 'Rajshahi',
    districts: [
      {
        name: 'Bogura',
        upazilas: [
          'Adamdighi',
          'Bogura Sadar',
          'Dhunat',
          'Dhupchanchia',
          'Gabtali',
          'Kahaloo',
          'Nandigram',
          'Sariakandi',
          'Shajahanpur',
          'Sherpur',
          'Shibganj',
          'Sonatala',
        ],
      },
      {
        name: 'Chapainawabganj',
        upazilas: ['Bholahat', 'Chapainawabganj Sadar', 'Gomastapur', 'Nachole', 'Shibganj'],
      },
      {
        name: 'Joypurhat',
        upazilas: ['Akkelpur', 'Joypurhat Sadar', 'Kalai', 'Khetlal', 'Panchbibi'],
      },
      {
        name: 'Naogaon',
        upazilas: [
          'Atrai',
          'Badalgachhi',
          'Dhamoirhat',
          'Manda',
          'Mohadevpur',
          'Naogaon Sadar',
          'Niamatpur',
          'Patnitala',
          'Porsha',
          'Raninagar',
          'Sapahar',
        ],
      },
      {
        name: 'Natore',
        upazilas: [
          'Bagatipara',
          'Baraigram',
          'Gurudaspur',
          'Lalpur',
          'Naldanga',
          'Natore Sadar',
          'Singra',
        ],
      },
      {
        name: 'Pabna',
        upazilas: [
          'Atgharia',
          'Bera',
          'Bhangura',
          'Chatmohar',
          'Faridpur',
          'Ishwardi',
          'Pabna Sadar',
          'Santhia',
          'Sujanagar',
        ],
      },
      {
        name: 'Rajshahi',
        upazilas: [
          'Bagha',
          'Bagmara',
          'Boalia',
          'Charghat',
          'Durgapur',
          'Godagari',
          'Matihar',
          'Mohanpur',
          'Paba',
          'Puthia',
          'Rajpara',
          'Shah Makhdum',
          'Tanore',
        ],
      },
      {
        name: 'Sirajganj',
        upazilas: [
          'Belkuchi',
          'Chauhali',
          'Kamarkhanda',
          'Kazipur',
          'Raiganj',
          'Shahjadpur',
          'Sirajganj Sadar',
          'Tarash',
          'Ullahpara',
        ],
      },
    ],
  },
  {
    name: 'Khulna',
    districts: [
      {
        name: 'Bagerhat',
        upazilas: [
          'Bagerhat Sadar',
          'Chitalmari',
          'Fakirhat',
          'Kachua',
          'Mollahat',
          'Mongla',
          'Morrelganj',
          'Rampal',
          'Sarankhola',
        ],
      },
      {
        name: 'Chuadanga',
        upazilas: ['Alamdanga', 'Chuadanga Sadar', 'Damurhuda', 'Jibannagar'],
      },
      {
        name: 'Jashore',
        upazilas: [
          'Abhaynagar',
          'Bagherpara',
          'Chaugachha',
          'Jashore Sadar',
          'Jhikargachha',
          'Keshabpur',
          'Manirampur',
          'Sharsha',
        ],
      },
      {
        name: 'Jhenaidah',
        upazilas: [
          'Harinakunda',
          'Jhenaidah Sadar',
          'Kaliganj',
          'Kotchandpur',
          'Maheshpur',
          'Shailkupa',
        ],
      },
      {
        name: 'Khulna',
        upazilas: [
          'Batiaghata',
          'Dacope',
          'Daulatpur',
          'Dighalia',
          'Dumuria',
          'Khalishpur',
          'Khan Jahan Ali',
          'Khulna Sadar',
          'Koyra',
          'Paikgachha',
          'Phultala',
          'Rupsha',
          'Sonadanga',
          'Terokhada',
        ],
      },
      {
        name: 'Kushtia',
        upazilas: ['Bheramara', 'Daulatpur', 'Khoksa', 'Kumarkhali', 'Kushtia Sadar', 'Mirpur'],
      },
      {
        name: 'Magura',
        upazilas: ['Magura Sadar', 'Mohammadpur', 'Shalikha', 'Sreepur'],
      },
      {
        name: 'Meherpur',
        upazilas: ['Gangni', 'Meherpur Sadar', 'Mujibnagar'],
      },
      {
        name: 'Narail',
        upazilas: ['Kalia', 'Lohagara', 'Narail Sadar'],
      },
      {
        name: 'Satkhira',
        upazilas: [
          'Assasuni',
          'Debhata',
          'Kalaroa',
          'Kaliganj',
          'Satkhira Sadar',
          'Shyamnagar',
          'Tala',
        ],
      },
    ],
  },
  {
    name: 'Barishal',
    districts: [
      {
        name: 'Barguna',
        upazilas: ['Amtali', 'Bamna', 'Barguna Sadar', 'Betagi', 'Patharghata', 'Taltali'],
      },
      {
        name: 'Barishal',
        upazilas: [
          'Agailjhara',
          'Babuganj',
          'Bakerganj',
          'Banaripara',
          'Barishal Sadar',
          'Gaurnadi',
          'Hizla',
          'Mehendiganj',
          'Muladi',
          'Wazirpur',
        ],
      },
      {
        name: 'Bhola',
        upazilas: [
          'Bhola Sadar',
          'Burhanuddin',
          'Char Fasson',
          'Daulatkhan',
          'Lalmohan',
          'Manpura',
          'Tazumuddin',
        ],
      },
      {
        name: 'Jhalokati',
        upazilas: ['Jhalokati Sadar', 'Kathalia', 'Nalchity', 'Rajapur'],
      },
      {
        name: 'Patuakhali',
        upazilas: [
          'Bauphal',
          'Dashmina',
          'Dumki',
          'Galachipa',
          'Kalapara',
          'Mirzaganj',
          'Patuakhali Sadar',
          'Rangabali',
        ],
      },
      {
        name: 'Pirojpur',
        upazilas: [
          'Bhandaria',
          'Indurkani',
          'Kawkhali',
          'Mathbaria',
          'Nazirpur',
          'Nesarabad',
          'Pirojpur Sadar',
        ],
      },
    ],
  },
  {
    name: 'Sylhet',
    districts: [
      {
        name: 'Habiganj',
        upazilas: [
          'Ajmiriganj',
          'Bahubal',
          'Baniachong',
          'Chunarughat',
          'Habiganj Sadar',
          'Lakhai',
          'Madhabpur',
          'Nabiganj',
          'Shayestaganj',
        ],
      },
      {
        name: 'Moulvibazar',
        upazilas: [
          'Barlekha',
          'Juri',
          'Kamalganj',
          'Kulaura',
          'Moulvibazar Sadar',
          'Rajnagar',
          'Sreemangal',
        ],
      },
      {
        name: 'Sunamganj',
        upazilas: [
          'Bishwamvarpur',
          'Chhatak',
          'Derai',
          'Dharampasha',
          'Dowarabazar',
          'Jagannathpur',
          'Jamalganj',
          'Madhyanagar',
          'Shantiganj',
          'Sullah',
          'Sunamganj Sadar',
          'Tahirpur',
        ],
      },
      {
        name: 'Sylhet',
        upazilas: [
          'Balaganj',
          'Beanibazar',
          'Bishwanath',
          'Companiganj',
          'Dakshin Surma',
          'Fenchuganj',
          'Golapganj',
          'Gowainghat',
          'Jaintiapur',
          'Kanaighat',
          'Osmani Nagar',
          'Sylhet Sadar',
          'Zakiganj',
        ],
      },
    ],
  },
  {
    name: 'Rangpur',
    districts: [
      {
        name: 'Dinajpur',
        upazilas: [
          'Birampur',
          'Birganj',
          'Biral',
          'Bochaganj',
          'Chirirbandar',
          'Dinajpur Sadar',
          'Fulbari',
          'Ghoraghat',
          'Hakimpur',
          'Kaharole',
          'Khansama',
          'Nawabganj',
          'Parbatipur',
        ],
      },
      {
        name: 'Gaibandha',
        upazilas: [
          'Fulchhari',
          'Gaibandha Sadar',
          'Gobindaganj',
          'Palashbari',
          'Sadullapur',
          'Saghata',
          'Sundarganj',
        ],
      },
      {
        name: 'Kurigram',
        upazilas: [
          'Bhurungamari',
          'Char Rajibpur',
          'Chilmari',
          'Kurigram Sadar',
          'Nageshwari',
          'Phulbari',
          'Rajarhat',
          'Raomari',
          'Ulipur',
        ],
      },
      {
        name: 'Lalmonirhat',
        upazilas: ['Aditmari', 'Hatibandha', 'Kaliganj', 'Lalmonirhat Sadar', 'Patgram'],
      },
      {
        name: 'Nilphamari',
        upazilas: ['Dimla', 'Domar', 'Jaldhaka', 'Kishoreganj', 'Nilphamari Sadar', 'Saidpur'],
      },
      {
        name: 'Panchagarh',
        upazilas: ['Atwari', 'Boda', 'Debiganj', 'Panchagarh Sadar', 'Tetulia'],
      },
      {
        name: 'Rangpur',
        upazilas: [
          'Badarganj',
          'Gangachara',
          'Kaunia',
          'Mithapukur',
          'Pirgachha',
          'Pirganj',
          'Rangpur Sadar',
          'Taraganj',
        ],
      },
      {
        name: 'Thakurgaon',
        upazilas: ['Baliadangi', 'Haripur', 'Pirganj', 'Ranisankail', 'Thakurgaon Sadar'],
      },
    ],
  },
  {
    name: 'Mymensingh',
    districts: [
      {
        name: 'Jamalpur',
        upazilas: [
          'Bakshiganj',
          'Dewanganj',
          'Islampur',
          'Jamalpur Sadar',
          'Madarganj',
          'Melandaha',
          'Sarishabari',
        ],
      },
      {
        name: 'Mymensingh',
        upazilas: [
          'Bhaluka',
          'Dhobaura',
          'Fulbaria',
          'Gaffargaon',
          'Gauripur',
          'Haluaghat',
          'Ishwarganj',
          'Muktagachha',
          'Mymensingh Sadar',
          'Nandail',
          'Phulpur',
          'Tarakanda',
          'Trishal',
        ],
      },
      {
        name: 'Netrokona',
        upazilas: [
          'Atpara',
          'Barhatta',
          'Durgapur',
          'Kalmakanda',
          'Kendua',
          'Khaliajuri',
          'Madan',
          'Mohanganj',
          'Netrokona Sadar',
          'Purbadhala',
        ],
      },
      {
        name: 'Sherpur',
        upazilas: ['Jhenaigati', 'Nakla', 'Nalitabari', 'Sherpur Sadar', 'Sreebardi'],
      },
    ],
  },
];

export function createEmptyBdAddress(): StructuredBdAddress {
  return {
    careOf: '',
    villageRoadHouse: '',
    division: '',
    district: '',
    upazila: '',
    postOffice: '',
    postCode: '',
  };
}

export function getDistrictsForDivision(divisionName: string): BdDistrictData[] {
  const div = BD_DIVISIONS.find((d) => d.name === divisionName);
  return div ? div.districts : [];
}

export function getUpazilasForDistrict(divisionName: string, districtName: string): string[] {
  const districts = getDistrictsForDivision(divisionName);
  const dist = districts.find((d) => d.name === districtName);
  return dist ? dist.upazilas : [];
}

export function formatBdAddress(addr: StructuredBdAddress): string {
  const parts: string[] = [];
  if (addr.careOf.trim()) parts.push(`C/O: ${addr.careOf.trim()}`);
  if (addr.villageRoadHouse.trim()) parts.push(addr.villageRoadHouse.trim());
  const po = addr.postOffice.trim();
  const pc = addr.postCode.trim();
  if (po && pc) {
    parts.push(`P.O: ${po} (${pc})`);
  } else if (po) {
    parts.push(`P.O: ${po}`);
  } else if (pc) {
    parts.push(`Post Code: ${pc}`);
  }
  if (addr.upazila.trim()) parts.push(`P.S/Upazila: ${addr.upazila.trim()}`);
  if (addr.district.trim()) parts.push(`Dist: ${addr.district.trim()}`);
  if (addr.division.trim()) parts.push(`Div: ${addr.division.trim()}`);
  return parts.join(', ');
}

export function isBdAddressComplete(addr: StructuredBdAddress): boolean {
  return Boolean(
    addr.careOf.trim() &&
      addr.villageRoadHouse.trim() &&
      addr.division.trim() &&
      addr.district.trim() &&
      addr.upazila.trim() &&
      addr.postOffice.trim() &&
      /^\d{4}$/.test(addr.postCode.trim())
  );
}
