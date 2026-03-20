/**
 * locationData.js
 * Static data for country codes, countries, states, and districts.
 * India is covered comprehensively; other countries include states only.
 */

// ─── Country dialling codes ────────────────────────────────────────────────────
export const COUNTRY_CODES = [
  { code: '+91',  label: '+91',  country: 'India' },
  { code: '+1',   label: '+1',   country: 'USA / Canada' },
  { code: '+44',  label: '+44',  country: 'United Kingdom' },
  { code: '+61',  label: '+61',  country: 'Australia' },
  { code: '+65',  label: '+65',  country: 'Singapore' },
  { code: '+971', label: '+971', country: 'UAE' },
  { code: '+60',  label: '+60',  country: 'Malaysia' },
  { code: '+63',  label: '+63',  country: 'Philippines' },
  { code: '+66',  label: '+66',  country: 'Thailand' },
  { code: '+81',  label: '+81',  country: 'Japan' },
  { code: '+82',  label: '+82',  country: 'South Korea' },
  { code: '+86',  label: '+86',  country: 'China' },
  { code: '+49',  label: '+49',  country: 'Germany' },
  { code: '+33',  label: '+33',  country: 'France' },
  { code: '+7',   label: '+7',   country: 'Russia' },
  { code: '+55',  label: '+55',  country: 'Brazil' },
  { code: '+27',  label: '+27',  country: 'South Africa' },
  { code: '+92',  label: '+92',  country: 'Pakistan' },
  { code: '+94',  label: '+94',  country: 'Sri Lanka' },
  { code: '+880', label: '+880', country: 'Bangladesh' },
  { code: '+977', label: '+977', country: 'Nepal' },
]

// ─── Expected digit count per country code (for validation) ────────────────────
export const PHONE_LENGTHS = {
  '+91':  10, '+1':   10, '+44':  10, '+61':   9,
  '+65':   8, '+971':  9, '+60':   9, '+63':  10,
  '+66':   9, '+81':  10, '+82':  10, '+86':  11,
  '+49':  11, '+33':   9, '+7':   10, '+55':  11,
  '+27':  10, '+92':  10, '+94':   9, '+880': 10,
  '+977': 10,
}

// ─── Countries ────────────────────────────────────────────────────────────────
export const COUNTRIES = [
  'India', 'United States', 'United Kingdom', 'Australia', 'Canada',
  'Singapore', 'UAE', 'Malaysia', 'Philippines', 'Thailand', 'Japan',
  'South Korea', 'China', 'Germany', 'France', 'Russia', 'Brazil',
  'South Africa', 'Pakistan', 'Sri Lanka', 'Bangladesh', 'Nepal', 'Other',
].map(c => ({ value: c, label: c }))

// ─── States / Provinces by Country ────────────────────────────────────────────
export const STATES_BY_COUNTRY = {
  India: [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
    'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
    'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
    'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
    'Andaman & Nicobar Islands', 'Chandigarh',
    'Dadra & Nagar Haveli and Daman & Diu',
    'Delhi', 'Jammu & Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
  ],
  'United States': [
    'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado',
    'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho',
    'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana',
    'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi',
    'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey',
    'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
    'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina',
    'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia',
    'Washington', 'West Virginia', 'Wisconsin', 'Wyoming',
  ],
  'United Kingdom': ['England', 'Scotland', 'Wales', 'Northern Ireland'],
  Australia: [
    'New South Wales', 'Victoria', 'Queensland', 'South Australia',
    'Western Australia', 'Tasmania', 'Australian Capital Territory',
    'Northern Territory',
  ],
  Canada: [
    'Alberta', 'British Columbia', 'Manitoba', 'New Brunswick',
    'Newfoundland and Labrador', 'Nova Scotia', 'Ontario',
    'Prince Edward Island', 'Quebec', 'Saskatchewan',
    'Northwest Territories', 'Nunavut', 'Yukon',
  ],
  Singapore: [
    'Central Region', 'East Region', 'North Region', 'North-East Region', 'West Region',
  ],
  UAE: [
    'Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quwain',
    'Ras Al Khaimah', 'Fujairah',
  ],
  Malaysia: [
    'Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang',
    'Penang', 'Perak', 'Perlis', 'Sabah', 'Sarawak', 'Selangor',
    'Terengganu', 'Kuala Lumpur', 'Labuan', 'Putrajaya',
  ],
  Bangladesh: [
    'Barisal', 'Chittagong', 'Dhaka', 'Khulna', 'Mymensingh',
    'Rajshahi', 'Rangpur', 'Sylhet',
  ],
  'Sri Lanka': [
    'Central', 'Eastern', 'North Central', 'North Western', 'Northern',
    'Sabaragamuwa', 'Southern', 'Uva', 'Western',
  ],
  Nepal: [
    'Bagmati', 'Gandaki', 'Karnali', 'Koshi', 'Lumbini', 'Madhesh', 'Sudurpashchim',
  ],
  Pakistan: [
    'Balochistan', 'Khyber Pakhtunkhwa', 'Punjab', 'Sindh',
    'Azad Jammu and Kashmir', 'Gilgit-Baltistan', 'Islamabad Capital Territory',
  ],
}

// ─── Districts by Indian State ────────────────────────────────────────────────
// Districts are India-centric; other countries intentionally left empty.
export const DISTRICTS_BY_STATE = {
  'Andhra Pradesh': [
    'Visakhapatnam', 'Vizianagaram', 'Srikakulam', 'East Godavari',
    'West Godavari', 'Krishna', 'Guntur', 'Prakasam', 'Nellore',
    'Kurnool', 'Kadapa', 'Anantapur', 'Chittoor',
  ],
  'Arunachal Pradesh': [
    'Itanagar (Papum Pare)', 'Tawang', 'West Kameng', 'East Kameng',
    'Kurung Kumey', 'Upper Subansiri', 'West Siang', 'East Siang',
    'Upper Siang', 'Lower Dibang Valley', 'Dibang Valley', 'Anjaw',
    'Lohit', 'Namsai', 'Changlang', 'Tirap', 'Longding',
  ],
  'Assam': [
    'Kamrup Metropolitan', 'Kamrup', 'Sonitpur', 'Lakhimpur', 'Dibrugarh',
    'Tinsukia', 'Jorhat', 'Golaghat', 'Sivasagar', 'Cachar', 'Hailakandi',
    'Karimganj', 'Nagaon', 'Morigaon', 'Darrang', 'Udalguri', 'Bongaigaon',
    'Barpeta', 'Nalbari', 'Baksa', 'Chirang', 'Dhubri', 'Goalpara',
    'Kokrajhar', 'Dhemaji', 'Majuli', 'Biswanath', 'Hojai',
    'West Karbi Anglong', 'Karbi Anglong',
  ],
  'Bihar': [
    'Patna', 'Gaya', 'Bhagalpur', 'Muzaffarpur', 'Purnia', 'Darbhanga',
    'Arrah (Bhojpur)', 'Begusarai', 'Katihar', 'Munger', 'Chapra (Saran)',
    'Saharsa', 'Sitamarhi', 'Vaishali', 'Siwan', 'Samastipur',
    'Aurangabad', 'Nalanda', 'Buxar', 'Banka', 'Khagaria',
    'East Champaran', 'West Champaran', 'Madhepura', 'Supaul', 'Araria',
    'Kishanganj', 'Madhubani', 'Jehanabad', 'Nawada', 'Sheohar',
    'Sheikhpura', 'Gopalganj', 'Lakhisarai', 'Jamui', 'Rohtas', 'Kaimur',
  ],
  'Chhattisgarh': [
    'Raipur', 'Bilaspur', 'Durg', 'Rajnandgaon', 'Korba', 'Raigarh',
    'Bastar (Jagdalpur)', 'Surguja (Ambikapur)', 'Janjgir-Champa',
    'Mahasamund', 'Kanker', 'Dhamtari', 'Kabirdham', 'Kondagaon',
    'Narayanpur', 'Bijapur', 'Sukma', 'Dantewada', 'Baloda Bazar',
    'Gariaband', 'Balod', 'Mungeli', 'Surajpur', 'Balrampur', 'Bemetara',
    'Gaurela-Pendra-Marwahi', 'Sakti', 'Koria', 'Manendragarh',
  ],
  'Goa': ['North Goa', 'South Goa'],
  'Gujarat': [
    'Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Bhavnagar', 'Jamnagar',
    'Junagadh', 'Gandhinagar', 'Anand', 'Mehsana', 'Surendranagar',
    'Navsari', 'Valsad', 'Bharuch', 'Narmada', 'Tapi', 'The Dangs',
    'Sabarkantha', 'Banaskantha', 'Patan', 'Morbi', 'Botad',
    'Gir Somnath', 'Amreli', 'Porbandar', 'Devbhumi Dwarka', 'Kutch',
    'Panchmahal', 'Dahod', 'Chhota Udaipur', 'Kheda', 'Aravalli',
  ],
  'Haryana': [
    'Gurugram', 'Faridabad', 'Ambala', 'Panchkula', 'Rohtak', 'Hisar',
    'Karnal', 'Panipat', 'Yamunanagar', 'Sonipat', 'Bhiwani',
    'Mahendragarh', 'Jhajjar', 'Rewari', 'Nuh', 'Palwal', 'Kurukshetra',
    'Kaithal', 'Jind', 'Fatehabad', 'Sirsa', 'Charkhi Dadri',
  ],
  'Himachal Pradesh': [
    'Shimla', 'Kangra', 'Mandi', 'Solan', 'Sirmaur', 'Kullu', 'Una',
    'Hamirpur', 'Bilaspur', 'Chamba', 'Kinnaur', 'Lahaul and Spiti',
  ],
  'Jharkhand': [
    'Ranchi', 'Dhanbad', 'East Singhbhum (Jamshedpur)', 'Bokaro',
    'Hazaribagh', 'Deoghar', 'Giridih', 'Chatra', 'Koderma', 'Ramgarh',
    'Gumla', 'Simdega', 'Lohardaga', 'West Singhbhum', 'Seraikela Kharsawan',
    'Khunti', 'Latehar', 'Pakur', 'Dumka', 'Sahibganj', 'Godda',
    'Jamtara', 'Garhwa', 'Palamu',
  ],
  'Karnataka': [
    'Bengaluru Urban', 'Bengaluru Rural', 'Mysuru', 'Dakshina Kannada (Mangaluru)',
    'Dharwad (Hubballi)', 'Belagavi', 'Kalaburagi', 'Ballari', 'Vijayapura',
    'Davangere', 'Shivamogga', 'Tumakuru', 'Udupi', 'Hassan', 'Mandya',
    'Raichur', 'Koppal', 'Gadag', 'Haveri', 'Uttara Kannada', 'Chikkamagaluru',
    'Chikkaballapur', 'Kodagu', 'Bagalkot', 'Bidar', 'Yadgir',
    'Ramanagara', 'Chitradurga', 'Chamarajanagara',
  ],
  'Kerala': [
    'Thiruvananthapuram', 'Kollam', 'Pathanamthitta', 'Alappuzha', 'Kottayam',
    'Idukki', 'Ernakulam', 'Thrissur', 'Palakkad', 'Malappuram',
    'Kozhikode', 'Wayanad', 'Kannur', 'Kasaragod',
  ],
  'Madhya Pradesh': [
    'Bhopal', 'Indore', 'Jabalpur', 'Gwalior', 'Ujjain', 'Sagar', 'Rewa',
    'Satna', 'Katni', 'Chhindwara', 'Ratlam', 'Khandwa', 'Shivpuri',
    'Mandsaur', 'Damoh', 'Vidisha', 'Betul', 'Morena', 'Bhind', 'Guna',
    'Balaghat', 'Seoni', 'Hoshangabad', 'Dewas', 'Rajgarh', 'Datia',
    'Panna', 'Chhatarpur', 'Tikamgarh', 'Narsinghpur', 'Shahdol',
    'Anuppur', 'Umaria', 'Dindori', 'Mandla', 'Sidhi', 'Singrauli',
    'Barwani', 'Khargone', 'Burhanpur', 'Alirajpur', 'Jhabua', 'Ashoknagar',
    'Niwari', 'Agar Malwa',
  ],
  'Maharashtra': [
    'Mumbai City', 'Mumbai Suburban', 'Pune', 'Thane', 'Nagpur', 'Nashik',
    'Aurangabad', 'Solapur', 'Kolhapur', 'Ahmednagar', 'Jalgaon', 'Raigad',
    'Satara', 'Sangli', 'Nanded', 'Latur', 'Osmanabad', 'Beed', 'Buldhana',
    'Akola', 'Amravati', 'Yavatmal', 'Wardha', 'Chandrapur', 'Gadchiroli',
    'Gondia', 'Bhandara', 'Washim', 'Hingoli', 'Parbhani', 'Jalna',
    'Dhule', 'Nandurbar', 'Ratnagiri', 'Sindhudurg', 'Palghar',
  ],
  'Manipur': [
    'Imphal West', 'Imphal East', 'Thoubal', 'Bishnupur', 'Churachandpur',
    'Senapati', 'Ukhrul', 'Chandel', 'Tamenglong', 'Jiribam', 'Kakching',
    'Tengnoupal', 'Kamjong', 'Noney', 'Pherzawl',
  ],
  'Meghalaya': [
    'East Khasi Hills (Shillong)', 'West Khasi Hills', 'South West Khasi Hills',
    'Ri Bhoi', 'East Jaintia Hills', 'West Jaintia Hills',
    'East Garo Hills', 'West Garo Hills', 'South Garo Hills', 'North Garo Hills',
  ],
  'Mizoram': [
    'Aizawl', 'Lunglei', 'Serchhip', 'Champhai', 'Kolasib', 'Mamit',
    'Lawngtlai', 'Siaha', 'Saitual', 'Khawzawl', 'Hnahthial',
  ],
  'Nagaland': [
    'Kohima', 'Dimapur', 'Mokokchung', 'Wokha', 'Zunheboto', 'Phek',
    'Tuensang', 'Mon', 'Longleng', 'Kiphire', 'Peren', 'Noklak',
  ],
  'Odisha': [
    'Khordha (Bhubaneswar)', 'Cuttack', 'Sambalpur', 'Ganjam (Berhampur)',
    'Sundargarh (Rourkela)', 'Balasore', 'Mayurbhanj (Baripada)', 'Puri',
    'Koraput', 'Angul', 'Dhenkanal', 'Kalahandi', 'Balangir', 'Bargarh',
    'Kendrapara', 'Jagatsinghpur', 'Nayagarh', 'Boudh', 'Kandhamal',
    'Gajapati', 'Malkangiri', 'Nabarangpur', 'Nuapada', 'Rayagada',
    'Jharsuguda', 'Deogarh', 'Kendujhar', 'Sonepur', 'Subarnapur',
  ],
  'Punjab': [
    'Ludhiana', 'Amritsar', 'Jalandhar', 'Patiala', 'Bathinda', 'Mohali',
    'Hoshiarpur', 'Gurdaspur', 'Firozpur', 'Moga', 'Pathankot', 'Fazilka',
    'Muktsar', 'Sangrur', 'Fatehgarh Sahib', 'Ropar', 'Nawanshahr',
    'Barnala', 'Mansa', 'Kapurthala', 'Tarn Taran',
  ],
  'Rajasthan': [
    'Jaipur', 'Jodhpur', 'Kota', 'Bikaner', 'Udaipur', 'Ajmer', 'Alwar',
    'Bharatpur', 'Bhilwara', 'Sri Ganganagar', 'Sikar', 'Tonk', 'Nagaur',
    'Jhunjhunu', 'Churu', 'Barmer', 'Jaisalmer', 'Pali', 'Jalore', 'Sirohi',
    'Baran', 'Bundi', 'Jhalawar', 'Chittorgarh', 'Dungarpur', 'Banswara',
    'Rajsamand', 'Pratapgarh', 'Karauli', 'Sawai Madhopur', 'Dausa', 'Dholpur',
    'Hanumangarh',
  ],
  'Sikkim': [
    'East Sikkim (Gangtok)', 'West Sikkim', 'North Sikkim', 'South Sikkim',
    'Pakyong', 'Soreng',
  ],
  'Tamil Nadu': [
    'Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem',
    'Tirunelveli', 'Tiruppur', 'Vellore', 'Erode', 'Thanjavur', 'Dindigul',
    'Ranipet', 'Krishnagiri', 'Villupuram', 'Cuddalore', 'Nagapattinam',
    'Tiruvallur', 'Kanchipuram', 'Chengalpattu', 'Dharmapuri', 'Namakkal',
    'Perambalur', 'Ariyalur', 'Karur', 'Tiruvarur', 'Pudukkottai', 'Theni',
    'Virudhunagar', 'Ramanathapuram', 'Sivaganga', 'Tenkasi', 'Tirupathur',
    'Kallakurichi', 'Mayiladuthurai', 'Kanyakumari', 'Nilgiris',
  ],
  'Telangana': [
    'Hyderabad', 'Rangareddy', 'Medchal-Malkajgiri', 'Sangareddy',
    'Warangal Urban', 'Karimnagar', 'Nizamabad', 'Khammam', 'Nalgonda',
    'Adilabad', 'Mancherial', 'Siddipet', 'Medak', 'Suryapet', 'Kamareddy',
    'Nagarkurnool', 'Narayanpet', 'Wanaparthy', 'Mahabubabad',
    'Bhadradri Kothagudem', 'Jayashankar Bhupalpally', 'Jogulamba Gadwal',
    'Kumuram Bheem', 'Mulugu', 'Nirmal', 'Peddapalli', 'Rajanna Sircilla',
    'Vikarabad', 'Warangal Rural', 'Yadadri Bhuvangiri', 'Hanamkonda',
  ],
  'Tripura': [
    'West Tripura (Agartala)', 'Gomati', 'Sepahijala', 'Khowai',
    'Unakoti', 'North Tripura', 'Dhalai', 'South Tripura',
  ],
  'Uttar Pradesh': [
    'Lucknow', 'Kanpur Nagar', 'Agra', 'Varanasi', 'Meerut',
    'Prayagraj (Allahabad)', 'Ghaziabad', 'Gautam Buddha Nagar (Noida)',
    'Bareilly', 'Aligarh', 'Moradabad', 'Saharanpur', 'Gorakhpur',
    'Firozabad', 'Jhansi', 'Muzaffarnagar', 'Mathura', 'Rampur',
    'Shahjahanpur', 'Farrukhabad', 'Mau', 'Hapur', 'Etawah',
    'Mirzapur', 'Bulandshahr', 'Sambhal', 'Amroha', 'Hardoi', 'Fatehpur',
    'Raebareli', 'Jalaun (Orai)', 'Sitapur', 'Bahraich', 'Unnao',
    'Jaunpur', 'Lakhimpur Kheri', 'Hathras', 'Banda', 'Pilibhit',
    'Barabanki', 'Azamgarh', 'Bijnor', 'Badaun', 'Gonda', 'Sultanpur',
    'Shravasti', 'Basti', 'Kushinagar', 'Deoria', 'Ballia', 'Pratapgarh',
    'Kanpur Dehat', 'Sonbhadra', 'Chitrakoot', 'Hamirpur', 'Mahoba',
    'Etah', 'Mainpuri', 'Kasganj', 'Shamli', 'Amethi', 'Ambedkar Nagar',
    'Sant Kabir Nagar', 'Maharajganj', 'Siddharthnagar', 'Balrampur',
  ],
  'Uttarakhand': [
    'Dehradun', 'Haridwar', 'Nainital', 'Udham Singh Nagar', 'Almora',
    'Pauri Garhwal', 'Tehri Garhwal', 'Uttarkashi', 'Chamoli', 'Bageshwar',
    'Pithoragarh', 'Champawat', 'Rudraprayag',
  ],
  'West Bengal': [
    'Kolkata', 'Howrah', 'Hooghly', 'North 24 Parganas', 'South 24 Parganas',
    'Nadia', 'Murshidabad', 'Bardhaman', 'Birbhum', 'Bankura', 'Purulia',
    'Paschim Medinipur', 'Purba Medinipur', 'Jalpaiguri', 'Alipurduar',
    'Cooch Behar', 'Darjeeling', 'Kalimpong', 'Malda',
    'Uttar Dinajpur', 'Dakshin Dinajpur', 'Jhargram',
  ],
  // Union Territories
  'Andaman & Nicobar Islands': ['South Andaman', 'North and Middle Andaman', 'Nicobar'],
  'Chandigarh': ['Chandigarh'],
  'Dadra & Nagar Haveli and Daman & Diu': ['Dadra & Nagar Haveli', 'Daman', 'Diu'],
  'Delhi': [
    'Central Delhi', 'East Delhi', 'New Delhi', 'North Delhi', 'North East Delhi',
    'North West Delhi', 'Shahdara', 'South Delhi', 'South East Delhi',
    'South West Delhi', 'West Delhi',
  ],
  'Jammu & Kashmir': [
    'Srinagar', 'Jammu', 'Anantnag', 'Baramulla', 'Kupwara', 'Pulwama',
    'Shopian', 'Kulgam', 'Bandipora', 'Ganderbal', 'Budgam', 'Rajouri',
    'Poonch', 'Udhampur', 'Reasi', 'Ramban', 'Doda', 'Kishtwar',
    'Kathua', 'Samba',
  ],
  'Ladakh': ['Leh', 'Kargil'],
  'Lakshadweep': ['Kavaratti', 'Agatti', 'Amini', 'Andrott', 'Minicoy'],
  'Puducherry': ['Puducherry', 'Karaikal', 'Mahe', 'Yanam'],
}
