import { FC, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    AttachMoney,
    Favorite,
    FavoriteBorder,
    Gavel,
    HeartBroken,
    LabelImportant,
    LocalFireDepartment,
    MonetizationOn,
    Public,
    Shield,
    Star,
    ThumbUp,
    WbSunny,
    Whatshot,
    Build,
    WorkspacePremium,
    ExpandCircleDown,
    FireHydrantAlt,
    Palette,
    Boy,
    Emergency,
    EmojiEvents,
    Euro,
    Extension,
    Factory,
    Fastfood,
    FastForward,
    FastRewind,
    Feed,
    FiberManualRecord,
    Fingerprint,
    FireExtinguisher,
    FireTruck,
    FitnessCenter,
    Flag,
    Flare,
    FlashlightOn,
    Flatware,
    Girl,
    GpsFixed,
    Grass,
    Group,
    Handshake,
    Handyman,
    Hardware,
    Headphones,
    HeadsetMic,
    Healing,
    HealthAndSafety,
    Hearing,
    Hexagon,
    Hiking,
    Hive,
    Home,
    HomeRepairService,
    Hotel,
    Icecream,
    IceSkating,
    InsertChart,
    Iron,
    JoinFull,
    Key,
    Keyboard,
    Kitchen,
    Label,
    Language,
    Laptop,
    Layers,
    Light,
    LineStyle,
    LineWeight,
    Link,
    Liquor,
    LocalActivity,
    LocalBar,
    LocalCafe,
    LocalDining,
    LocalFlorist,
    LocalGasStation,
    LocalHospital,
    LocalMall,
    LocalPharmacy,
    LocalPizza,
    LocalPrintshop,
    LocalShipping,
    LocalTaxi,
    LocationCity,
    LockOpen,
    Luggage,
    LunchDining,
    Mail,
    Male,
    Man,
    MarkunreadMailbox,
    MedicalInformation,
    MedicalServices,
    Medication,
    MeetingRoom,
    Memory,
    MenuBook,
    Mic,
    MilitaryTech,
    Mode,
    Monitor,
    MonitorHeart,
    Moped,
    More,
    Mosque,
    Mouse,
    Movie,
    NewReleases,
    Notifications,
    OilBarrel,
    OutdoorGrill,
    Outlet,
    Park,
    PedalBike,
    Pets,
    Phishing,
    Piano,
    PieChart,
    Plumbing,
    PointOfSale,
    Pool,
    Power,
    PrecisionManufacturing,
    PropaneTank,
    Psychology,
    PunchClock,
    PushPin,
    Radar,
    Radio,
    Receipt,
    Recommend,
    Rectangle,
    Redeem,
    Refresh,
    Restaurant,
    RiceBowl,
    Rocket,
    RollerSkating,
    RoomService,
    Router,
    Sailing,
    Sanitizer,
    SatelliteAlt,
    Save,
    Savings,
    School,
    SdCard,
    SelfImprovement,
    SensorDoor,
    SensorWindow,
    Settings,
    Skateboarding,
    Sledding,
    SmokingRooms,
    Snowboarding,
    Snowmobile,
    Snowshoeing,
    SoupKitchen,
    Spa,
    Speed,
    Sports,
    SportsBar,
    SportsBaseball,
    SportsBasketball,
    SportsCricket,
    SportsEsports,
    SportsFootball,
    SportsGolf,
    SportsHockey,
    SportsMotorsports,
    SportsRugby,
    SportsSoccer,
    SportsTennis,
    SportsVolleyball,
    Square,
    Stadium,
    Stars,
    Store,
    Straighten,
    Stroller,
    Style,
    Subway,
    Surfing,
    Synagogue,
    Tag,
    TakeoutDining,
    Tapas,
    TempleBuddhist,
    TempleHindu,
    TheaterComedy,
    ThumbDown,
    Thunderstorm,
    Timer,
    Token,
    Tornado,
    Toys,
    Traffic,
    Train,
    Tram,
    Transgender,
    Tsunami,
    Twitter,
    Umbrella,
    Vaccines,
    VapingRooms,
    Verified,
    Visibility,
    Volcano,
    VolumeUp,
    WaterDrop,
    WindPower,
} from '@mui/icons-material';
import {
    Payments,
    Bedtime,
    AcUnit,
    Sell,
    WatchLater,
    HourglassBottom,
    SentimentSatisfied,
    SentimentDissatisfied,
    Anchor,
    Bolt,
    BackHand,
    Audiotrack,
    AttachFile,
    BatteryFull,
    BatterySaver,
    BatteryAlert,
    BatteryChargingFull,
    Bookmark,
    BugReport,
    Cake,
    CameraAlt,
    Camera,
    DirectionsCar,
    Cloud,
    Cancel,
    CameraRoll,
    CalendarToday,
    Castle,
    CatchingPokemon,
    Chair,
    CheckCircle,
    Church,
    Coffee,
    Colorize,
    CompassCalibration,
    Construction,
    Cookie,
    Cottage,
    Dangerous,
    Diamond,
    Directions,
    Coronavirus,
    Delete,
    DoNotDisturb,
    Email,
    Error,
    Feedback,
    Female,
    Explore,
    FilterVintage,
    FilterAlt,
    FilterHdr,
    FlashOn,
    Flight,
    Forest,
    Fort,
    FormatPaint,
    FreeBreakfast,
} from '@mui/icons-material';
import { Stat } from '../content/Stat';

const KEEP_FIRST_ICONS = ['star', 'heart', 'favorite', 'wrench', 'coin', 'shield', 'sun', 'moon', 'fire', 'flake', 'bolt', 'happy', 'sad', 'battery'];
const RATING_ICON_OPTIONS: { key: string; labels: string[]; icon: any }[] = [
    { key: 'star', labels: ['Star', 'Space', 'Rating'], icon: Star },
    { key: 'heart', labels: ['Heart', 'Health'], icon: Favorite },
    { key: 'favorite', labels: ['Favorite', 'Heart', 'Health'], icon: FavoriteBorder },
    { key: 'wrench', labels: ['Wrench', 'Repair', 'Fix', 'Tool'], icon: Build },
    { key: 'coin', labels: ['Coin', 'Money', 'Wealth'], icon: MonetizationOn },
    { key: 'money', labels: ['Money', 'Wealth'], icon: AttachMoney },
    { key: 'cash', labels: ['Cash', 'Money', 'Wealth'], icon: Payments },
    { key: 'shield', labels: ['Shield', 'Protection', 'Defense', 'Armor', 'Guard'], icon: Shield },
    { key: 'sun', labels: ['Sun', 'Light', 'Day'], icon: WbSunny },
    { key: 'moon', labels: ['Moon', 'Night'], icon: Bedtime },
    { key: 'fire', labels: ['Fire', 'Flame', 'Heat'], icon: LocalFireDepartment },
    { key: 'flake', labels: ['Flake', 'Cold', 'AC', 'Ice', 'Cool'], icon: AcUnit },
    { key: 'spark', labels: ['Spark', 'Fire', 'Flame', 'Heat'], icon: Whatshot },
    { key: 'award', labels: ['Award', 'Prize', 'Recognition'], icon: WorkspacePremium },
    { key: 'thumbs-up', labels: ['Thumbs Up', 'Like', 'Approve', 'Approval'], icon: ThumbUp },
    { key: 'gavel', labels: ['Gavel', 'Judge', 'Law', 'Hammer'], icon: Gavel },
    { key: 'heart-broken', labels: ['Broken Heart'], icon: HeartBroken },
    { key: 'chevron', labels: ['Chevron', 'Arrow', 'Direction'], icon: LabelImportant },
    { key: 'world', labels: ['World', 'Earth', 'Globe'], icon: Public },
    { key: 'tag', labels: ['Tag', 'Label', 'Price'], icon: Sell },
    { key: 'clock', labels: ['Clock', 'Time'], icon: WatchLater },
    { key: 'time', labels: ['Time', 'Hourglass', 'Clock'], icon: HourglassBottom },
    { key: 'happy', labels: ['Happy', 'Smiley'], icon: SentimentSatisfied },
    { key: 'sad', labels: ['Sad', 'Unhappy', 'Frown'], icon: SentimentDissatisfied },
    { key: 'anchor', labels: ['Anchor', 'Navy', 'Naval', 'Ship', 'Nautical'], icon: Anchor },
    { key: 'bolt', labels: ['Bolt', 'Lightning', 'Electric', 'Energy'], icon: Bolt },
    { key: 'hand', labels: ['Hand', 'Palm', 'Fingers'], icon: BackHand },
    { key: 'music', labels: ['Music', 'Song', 'Audio'], icon: Audiotrack },
    { key: 'clip', labels: ['Clip', 'Attachment', 'File'], icon: AttachFile },
    { key: 'battery', labels: ['Battery', 'Power', 'Energy'], icon: BatteryFull },
    { key: 'battery-plus', labels: ['Battery Plus', 'Power', 'Energy'], icon: BatterySaver },
    { key: 'battery-alert', labels: ['Battery Alert', 'Power', 'Energy'], icon: BatteryAlert },
    { key: 'battery-charging', labels: ['Battery Charging', 'Power', 'Energy'], icon: BatteryChargingFull },
    { key: 'bookmark', labels: ['Bookmark', 'Save'], icon: Bookmark },
    { key: 'boy', labels: ['Boy', 'Child', 'Kid', 'Male'], icon: Boy },
    { key: 'bug', labels: ['Bug', 'Insect', 'Error'], icon: BugReport },
    { key: 'cake', labels: ['Cake', 'Dessert', 'Sweet'], icon: Cake },
    { key: 'camera', labels: ['Camera', 'Photo', 'Picture'], icon: CameraAlt },
    { key: 'aperture', labels: ['Aperture', 'Lens', 'Photography'], icon: Camera },
    { key: 'car', labels: ['Car', 'Vehicle', 'Automobile'], icon: DirectionsCar },
    { key: 'cloud', labels: ['Cloud', 'Sky', 'Weather'], icon: Cloud },
    { key: 'cancel', labels: ['Cancel', 'Close', 'Exit'], icon: Cancel },
    { key: 'camera-roll', labels: ['Camera Roll', 'Photos', 'Gallery'], icon: CameraRoll },
    { key: 'calendar', labels: ['Calendar', 'Date', 'Schedule'], icon: CalendarToday },
    { key: 'castle', labels: ['Castle', 'Fortress', 'Building'], icon: Castle },
    { key: "pokemon", labels: ["Pokemon", "Game", "Creature"], icon: CatchingPokemon },
    { key: 'chair', labels: ['Chair', 'Seat', 'Furniture'], icon: Chair },
    { key: 'check', labels: ['Check', 'Confirm', 'Approve'], icon: CheckCircle },
    { key: 'church', labels: ['Church', 'Religion', 'Building'], icon: Church },
    { key: 'coffee', labels: ['Coffee', 'Drink', 'Beverage'], icon: Coffee },
    { key: 'palette', labels: ['Palette', 'Colors', 'Art'], icon: Palette },
    { key: 'color-picker', labels: ['Color Picker', 'Colors', 'Art'], icon: Colorize },
    { key: 'compass', labels: ['Compass', 'Navigation', 'Direction'], icon: CompassCalibration },
    { key: 'construction', labels: ['Construction', 'Building', 'Work'], icon: Construction },
    { key: 'cookie', labels: ['Cookie', 'Snack', 'Dessert'], icon: Cookie },
    { key: 'cottage', labels: ['Cottage', 'House', 'Building'], icon: Cottage },
    { key: 'dangerous', labels: ['Dangerous', 'Warning', 'Alert'], icon: Dangerous },
    { key: 'diamond', labels: ['Diamond', 'Gem', 'Jewelry'], icon: Diamond },
    { key: 'directions', labels: ['Directions', 'Navigation', 'Route'], icon: Directions },
    { key: 'virus', labels: ['Virus', 'Disease', 'Health'], icon: Coronavirus },
    { key: 'trash', labels: ['Trash', 'Delete', 'Garbage'], icon: Delete },
    { key: 'do-not-disturb', labels: ['Do Not Disturb', 'Privacy', 'Silent'], icon: DoNotDisturb },
    { key: 'email', labels: ['Email', 'Mail', 'Message'], icon: Email },
    { key: 'emergency', labels: ['Emergency', 'Asterisk', 'Alert'], icon: Emergency },
    { key: 'trophy', labels: ['Trophy', 'Award', 'Achievement'], icon: EmojiEvents },
    { key: 'error', labels: ['Error', 'Warning', 'Alert'], icon: Error },
    { key: 'euro', labels: ['Euro', 'Currency', 'Money'], icon: Euro },
    { key: 'explore', labels: ['Explore', 'Discover', 'Search'], icon: Explore },
    { key: 'down-circle', labels: ['Down Circle', 'Arrow', 'Direction'], icon: ExpandCircleDown },
    { key: 'puzzle-piece', labels: ['Puzzle Piece', 'Jigsaw'], icon: Extension },
    { key: 'factory', labels: ['Factory', 'Industry', 'Building'], icon: Factory },
    { key: 'fast-forward', labels: ['Fast Forward', 'Skip', 'Next'], icon: FastForward },
    { key: 'fast-rewind', labels: ['Fast Rewind', 'Back', 'Previous'], icon: FastRewind },
    { key: 'fast-food', labels: ['Fast Food', 'Meal', 'Quick'], icon: Fastfood },
    { key: 'paper', labels: ['Paper', 'Document', 'Sheet'], icon: Feed },
    { key: 'feedback', labels: ['Feedback', 'Response', 'Comment'], icon: Feedback },
    { key: 'female', labels: ['Female', 'Woman', 'Gender'], icon: Female },
    { key: 'circle', labels: ['Circle', 'Shape', 'Round'], icon: FiberManualRecord },
    { key: 'flower', labels: ['Flower', 'Plant', 'Nature'], icon: FilterVintage },
    { key: 'filter', labels: ['Filter', 'Sort', 'Refine'], icon: FilterAlt },
    { key: 'fingerprint', labels: ['Fingerprint', 'Security', 'Biometric'], icon: Fingerprint },
    { key: 'fire-extinguisher', labels: ['Fire Extinguisher', 'Safety', 'Emergency'], icon: FireExtinguisher },
    { key: 'fire-hydrant', labels: ['Fire Hydrant', 'Safety', 'Emergency'], icon: FireHydrantAlt },
    { key: 'fire-truck', labels: ['Fire Truck', 'Safety', 'Emergency'], icon: FireTruck },
    { key: 'barbell', labels: ['Barbell', 'Weight', 'Exercise'], icon: FitnessCenter },
    { key: 'mountain', labels: ['Mountain', 'Nature', 'Landscape'], icon: FilterHdr },
    { key: 'flag', labels: ['Flag', 'Banner', 'Symbol'], icon: Flag },
    { key: 'flare', labels: ['Flare', 'Light', 'Signal'], icon: Flare },
    { key: 'flashlight', labels: ['Flashlight', 'Light', 'Tool'], icon: FlashlightOn },
    { key: 'flatware', labels: ['Flatware', 'Cutlery', 'Utensils'], icon: Flatware },
    { key: 'flight', labels: ['Airplane', 'Flight', 'Travel'], icon: Flight },
    { key: 'lightning', labels: ['Lightning', 'Thunder', 'Weather'], icon: FlashOn },
    { key: 'forest', labels: ['Forest', 'Nature', 'Trees'], icon: Forest },
    { key: 'fortress', labels: ['Fortress', 'Castle', 'Building'], icon: Fort },
    { key: 'paint', labels: ['Paint', 'Art', 'Color'], icon: FormatPaint },
    { key: 'coffee-cup', labels: ['Coffee Cup', 'Drink', 'Beverage'], icon: FreeBreakfast },
    { key: 'front-loader', labels: ['Front Loader', 'Construction', 'Vehicle'], icon: Construction },
    { key: 'gamepad', labels: ['Gamepad', 'Controller', 'Gaming'], icon: Gamepad },
    { key: 'girl', labels: ['Girl', 'Child', 'Female'], icon: Girl },
    { key: 'target', labels: ['Target', 'Goal', 'Objective'], icon: GpsFixed },
    { key: 'grass', labels: ['Grass', 'Nature', 'Plant'], icon: Grass },
    { key: 'group', labels: ['Group', 'Team', 'People'], icon: Group },
    { key: 'handshake', labels: ['Handshake', 'Agreement', 'Greeting'], icon: Handshake },
    { key: 'handyman', labels: ['Handyman', 'Tool', 'Repair'], icon: Handyman },
    { key: 'hardware', labels: ['Hardware', 'Tool', 'Equipment'], icon: Hardware },
    { key: 'headphones', labels: ['Headphones', 'Audio', 'Music'], icon: Headphones },
    { key: 'headset-mic', labels: ['Headset Microphone', 'Audio', 'Communication'], icon: HeadsetMic },
    { key: 'healing', labels: ['Healing', 'Health', 'Medical'], icon: Healing },
    { key: 'health-and-safety', labels: ['Health and Safety', 'Health', 'Safety'], icon: HealthAndSafety },
    { key: 'hearing', labels: ['Hearing', 'Audio', 'Accessibility'], icon: Hearing },
    { key: 'hexagon', labels: ['Hexagon', 'Shape', 'Geometry'], icon: Hexagon },
    { key: 'hiking', labels: ['Hiking', 'Outdoor', 'Activity'], icon: Hiking },
    { key: 'hive', labels: ['Hive', 'Bee', 'Insect'], icon: Hive },
    { key: 'home', labels: ['Home', 'House', 'Building'], icon: Home },
    { key: 'home-repair', labels: ['Home Repair', 'Maintenance', 'Building'], icon: HomeRepairService },
    { key: 'hotel', labels: ['Bed', 'Sleep', 'Hotel', 'Accommodation', 'Building'], icon: Hotel },
    { key: 'ice-skating', labels: ['Ice Skating', 'Winter', 'Sport'], icon: IceSkating },
    { key: 'ice-cream', labels: ['Ice Cream', 'Dessert', 'Food'], icon: Icecream },
    { key: 'bar-graph', labels: ['Bar Graph', 'Chart', 'Data'], icon: InsertChart },
    { key: 'iron', labels: ['Iron', 'Tool', 'Metal'], icon: Iron },
    { key: 'venn', labels: ['Venn Diagram', 'Chart', 'Data'], icon: JoinFull },
    { key: 'key', labels: ['Key', 'Lock', 'Security'], icon: Key },
    { key: 'keyboard', labels: ['Keyboard', 'Input', 'Device'], icon: Keyboard },
    { key: 'kitchen', labels: ['Fridge', 'Refridgerator', 'Kitchen', 'Cooking', 'Home'], icon: Kitchen },
    { key: 'label', labels: ['Label', 'Tag', 'Organization'], icon: Label },
    { key: 'globe', labels: ['Globe', 'World', 'Earth'], icon: Language },
    { key: 'laptop', labels: ['Laptop', 'Computer', 'Device'], icon: Laptop },
    { key: 'layers', labels: ['Layers', 'Stack', 'Organization'], icon: Layers },
    { key: 'light', labels: ['Light', 'Illumination', 'Bulb'], icon: Light },
    { key: 'line-style', labels: ['Line Style', 'Line', 'Style'], icon: LineStyle },
    { key: 'line-weight', labels: ['Line Weight', 'Line', 'Style'], icon: LineWeight },
    { key: 'link', labels: ['Link', 'Chain', 'Connection'], icon: Link },
    { key: 'liquor', labels: ['Liquor', 'Alcohol', 'Drink'], icon: Liquor },
    { key: 'local-activity', labels: ['Ticket', 'Stub', 'Event', 'Activity'], icon: LocalActivity },
    { key: 'local-bar', labels: ['Drink', 'Alcohol', 'Bar', 'Activity'], icon: LocalBar },
    { key: 'local-cafe', labels: ['Coffee', 'Cafe', 'Drink', 'Activity'], icon: LocalCafe },
    { key: 'local-dining', labels: ['Dining', 'Restaurant', 'Food', 'Activity'], icon: LocalDining },
    { key: 'local-florist', labels: ['Flower', 'Florist'], icon: LocalFlorist },
    { key: 'local-gas-station', labels: ['Fuel', 'Station', 'Gas', 'Pump', 'Energy'], icon: LocalGasStation },
    { key: 'local-hospital', labels: ['Medical', 'Hospital', 'First Aid', 'Health'], icon: LocalHospital },
    { key: 'local-mall', labels: ['Shopping Bag', 'Mall', 'Shopping', 'Activity'], icon: LocalMall },
    { key: 'local-pharmacy', labels: ['Mortar', 'Pestle', 'Pharmacy', 'Medicine', 'Health', 'Activity'], icon: LocalPharmacy },
    { key: 'local-pizza', labels: ['Pizza', 'Restaurant', 'Food', 'Activity'], icon: LocalPizza },
    { key: 'local-printshop', labels: ['Printer', 'Shop', 'Printing', 'Activity'], icon: LocalPrintshop },
    { key: 'local-shipping', labels: ['Truck', 'Shipping', 'Delivery', 'Activity'], icon: LocalShipping },
    { key: 'local-taxi', labels: ['Taxi', 'Cab', 'Transport', 'Activity'], icon: LocalTaxi },
    { key: 'location-city', labels: ['City', 'Location', 'Urban', 'Activity'], icon: LocationCity },
    { key: 'lock', labels: ['Lock', 'Security', 'Privacy'], icon: Lock },
    { key: 'lock-open', labels: ['Open Lock', 'Lock', 'Security', 'Privacy'], icon: LockOpen },
    { key: 'luggage', labels: ['Luggage', 'Bag', 'Travel'], icon: Luggage },
    { key: 'lunch-dining', labels: ['Burger', 'Lunch', 'Dining', 'Food', 'Activity'], icon: LunchDining },
    { key: 'mail', labels: ['Letter', 'Post', 'Office', 'Mail'], icon: Mail },
    { key: 'male', labels: ['Male', 'Man', 'Person'], icon: Male },
    { key: 'man', labels: ['Man', 'Male', 'Person'], icon: Man },
    { key: 'map', labels: ['Map', 'Location', 'Navigation'], icon: Map },
    { key: 'markunread-mailbox', labels: ['Mailbox', 'Mail', 'Letter'], icon: MarkunreadMailbox },
    { key: 'medical-information', labels: ['Medical', 'Information', 'Health'], icon: MedicalInformation },
    { key: 'medical-services', labels: ['Medical', 'Services', 'Health'], icon: MedicalServices },
    { key: 'medication', labels: ['Medication', 'Pill', 'Health'], icon: Medication },
    { key: 'meeting-room', labels: ['Door', 'Open', 'Meeting', 'Room', 'Conference'], icon: MeetingRoom },
    { key: 'memory', labels: ['Chip', 'Memory', 'RAM', 'Computer'], icon: Memory },
    { key: 'menu-book', labels: ['Menu', 'Book', 'Reading', 'Activity'], icon: MenuBook },
    { key: 'mic', labels: ['Microphone', 'Audio', 'Sound', 'Recording'], icon: Mic },
    { key: 'military-tech', labels: ['Medal', 'Military', 'Technology', 'Defense'], icon: MilitaryTech },
    { key: 'mode', labels: ['Pencil', 'Edit', 'Mode', 'Settings', 'Configuration'], icon: Mode },
    { key: 'monitor', labels: ['Screen', 'Monitor', 'Display', 'Computer'], icon: Monitor },
    { key: 'monitor-heart', labels: ['EKG', 'Monitor', 'Heart', 'Health', 'Screen'], icon: MonitorHeart },
    { key: 'moped', labels: ['Moped', 'Scooter', 'Vehicle', 'Transport'], icon: Moped },
    { key: 'more', labels: ['More', 'Additional', 'Extra'], icon: More },
    { key: 'mouse', labels: ['Mouse', 'Computer', 'Peripheral'], icon: Mouse },
    { key: 'mosque', labels: ['Mosque', 'Religion', 'Building'], icon: Mosque },
    { key: 'movie', labels: ['Movie', 'Film', 'Cinema', 'Entertainment'], icon: Movie },
    { key: 'new-releases', labels: ['New', 'Releases', 'Entertainment'], icon: NewReleases },
    { key: 'notifications', labels: ['Bell', 'Alert', 'Notification'], icon: Notifications },
    { key: 'oil-barrel', labels: ['Oil', 'Barrel', 'Fuel', 'Energy'], icon: OilBarrel },
    { key: 'outdoor-grill', labels: ['Grill', 'BBQ', 'Cooking'], icon: OutdoorGrill },
    { key: 'outlet', labels: ['Outlet', 'Power', 'Electricity'], icon: Outlet },
    { key: 'park', labels: ['Tree', 'Park', 'Nature', 'Outdoor', 'Recreation'], icon: Park },
    { key: 'pedal-bike', labels: ['Bike', 'Bicycle', 'Vehicle', 'Transport'], icon: PedalBike },
    { key: 'pets', labels: ['Paw', 'Pets', 'Animals', 'Companion'], icon: Pets },
    { key: 'phishing', labels: ['Fishing', 'Hook', 'Phishing', 'Security', 'Fraud', 'Scam'], icon: Phishing },
    { key: 'piano', labels: ['Piano', 'keys', 'Music', 'Instrument'], icon: Piano },
    { key: 'pie-chart', labels: ['Pie', 'Chart', 'Graph', 'Statistics'], icon: PieChart },
    { key: 'plumbing', labels: ['Pipe Wrench', 'Plumbing', 'Pipe', 'Water', 'Repair'], icon: Plumbing },
    { key: 'point-of-sale', labels: ['Cash Register', 'Point Of Sale', 'Cashier'], icon: PointOfSale },
    { key: 'pool', labels: ['Pool', 'Swimming', 'Water', 'Recreation'], icon: Pool },
    { key: 'power', labels: ['Power', 'Electricity', 'Energy'], icon: Power },
    { key: 'precision-manufacturing', labels: ['Robot', 'Manufacturing', 'Industry', 'Engineering'], icon: PrecisionManufacturing },
    { key: 'propane-tank', labels: ['Propane', 'Tank', 'Fuel', 'Energy'], icon: PropaneTank },
    { key: 'psychology', labels: ['Psychology', 'Mind', 'Mental Health', 'Brain'], icon: Psychology },
    { key: 'punch-clock', labels: ['Punch Clock', 'Clock', 'Time', 'Attendance'], icon: PunchClock },
    { key: 'push-pin', labels: ['Push Pin', 'Pin', 'Location', 'Marker'], icon: PushPin },
    { key: 'radar', labels: ['Radar', 'Detection', 'Signal', 'Scanning'], icon: Radar },
    { key: 'radio', labels: ['Radio', 'Signal', 'Broadcast', 'Communication'], icon: Radio },
    { key: 'receipt', labels: ['Receipt', 'Invoice', 'Bill', 'Payment'], icon: Receipt },
    { key: 'recommend', labels: ['Recommend', 'Thumbs Up', 'Like', 'Approval'], icon: Recommend },
    { key: 'rectangle', labels: ['Rectangle', 'Shape', 'Geometry'], icon: Rectangle },
    { key: 'redeem', labels: ['Gift', 'Reward', 'Coupon', 'Voucher'], icon: Redeem },
    { key: 'refresh', labels: ['Refresh', 'Reload', 'Update', 'Sync'], icon: Refresh },
    { key: 'restaurant', labels: ['Flatware', 'Restaurant', 'Food', 'Dining', 'Meal'], icon: Restaurant },
    { key: 'rice-bowl', labels: ['Rice Bowl', 'Food', 'Meal'], icon: RiceBowl },
    { key: 'rocket', labels: ['Rocket', 'Space', 'Launch', 'Vehicle'], icon: Rocket },
    { key: 'roller-skating', labels: ['Roller Skating', 'Skating', 'Recreation'], icon: RollerSkating },
    { key: 'room-service', labels: ['Room Service', 'Hotel', 'Food', 'Hospitality', 'Service'], icon: RoomService },
    { key: 'router', labels: ['Router', 'Network', 'WiFi', 'Internet'], icon: Router },
    { key: 'sailing', labels: ['Sailboat', 'Boat', 'Water', 'Recreation'], icon: Sailing },
    { key: 'sanitizer', labels: ['Sanitizer', 'Hygiene', 'Clean', 'Health'], icon: Sanitizer },
    { key: 'satellite-alt', labels: ['Satellite', 'Signal', 'Communication', 'Space'], icon: SatelliteAlt },
    { key: 'save', labels: ['Save', 'Disk', 'Storage', 'Floppy'], icon: Save },
    { key: 'savings', labels: ['Savings', 'Money', 'Bank', 'Finance'], icon: Savings },
    { key: 'school', labels: ['Cap', 'School', 'Education', 'Learning'], icon: School },
    { key: 'sd-card', labels: ['SD Card', 'Storage', 'Memory'], icon: SdCard },
    { key: 'self-improvement', labels: ['Meditation', 'Zen', 'Self Improvement', 'Personal Growth', 'Development'], icon: SelfImprovement },
    { key: 'sensor-door', labels: ['Door', 'Security', 'Automation'], icon: SensorDoor },
    { key: 'sensor-window', labels: ['Window', 'Security', 'Automation'], icon: SensorWindow },
    { key: 'settings', labels: ['Gear', 'Cog', 'Settings', 'Configuration', 'Preferences'], icon: Settings },
    { key: 'skateboarding', labels: ['Skateboarding', 'Skate', 'Recreation'], icon: Skateboarding },
    { key: 'sledding', labels: ['Sledding', 'Snow', 'Recreation'], icon: Sledding },
    { key: 'smoking-rooms', labels: ['Smoking', 'Cigarette', 'Tobacco'], icon: SmokingRooms },
    { key: 'snowboarding', labels: ['Snowboarding', 'Snow', 'Recreation'], icon: Snowboarding },
    { key: 'snowmobile', labels: ['Snowmobile', 'Snow', 'Recreation'], icon: Snowmobile },
    { key: 'snowshoeing', labels: ['Snowshoeing', 'Snow', 'Recreation'], icon: Snowshoeing },
    { key: 'soup-kitchen', labels: ['Soup', 'Food', 'Ladle'], icon: SoupKitchen },
    { key: 'spa', labels: ['Flower', 'Leaves', 'Spa', 'Relaxation', 'Wellness', 'Health'], icon: Spa },
    { key: 'speed', labels: ['Speed', 'Fast', 'Velocity', 'Motion'], icon: Speed },
    { key: 'sports', labels: ['Whistle', 'Sports', 'Recreation', 'Exercise', 'Activity'], icon: Sports },
    { key: 'sports-bar', labels: ['Beer', 'Bar', 'Recreation', 'Drinks'], icon: SportsBar },
    { key: 'sports-baseball', labels: ['Baseball', 'Sports', 'Recreation', 'Exercise', 'Activity'], icon: SportsBaseball },
    { key: 'sports-basketball', labels: ['Basketball', 'Sports', 'Recreation', 'Exercise', 'Activity'], icon: SportsBasketball },
    { key: 'sports-cricket', labels: ['Cricket', 'Sports', 'Recreation', 'Exercise', 'Activity'], icon: SportsCricket },
    { key: 'sports-esports', labels: ['Controller', 'Recreation', 'Activity'], icon: SportsEsports },
    { key: 'sports-football', labels: ['Football', 'Soccer', 'Sports', 'Recreation', 'Exercise', 'Activity'], icon: SportsFootball },
    { key: 'sports-golf', labels: ['Golf', 'Sports', 'Recreation', 'Exercise', 'Activity'], icon: SportsGolf },
    { key: 'sports-hockey', labels: ['Hockey', 'Sports', 'Recreation', 'Exercise', 'Activity'], icon: SportsHockey },
    { key: 'sports-motorsports', labels: ['Racing Helmet', 'Helmet', 'Racing', 'Driving'], icon: SportsMotorsports },
    { key: 'sports-rugby', labels: ['Rugby', 'Sports', 'Recreation', 'Exercise', 'Activity'], icon: SportsRugby },
    { key: 'sports-soccer', labels: ['Soccer', 'Football', 'Sports', 'Recreation', 'Exercise', 'Activity'], icon: SportsSoccer },
    { key: 'sports-tennis', labels: ['Tennis', 'Sports', 'Recreation', 'Exercise', 'Activity'], icon: SportsTennis },
    { key: 'sports-volleyball', labels: ['Volleyball', 'Sports', 'Recreation', 'Exercise', 'Activity'], icon: SportsVolleyball },
    { key: 'square', labels: ['Square', 'Shape', 'Geometry'], icon: Square },
    { key: 'stadium', labels: ['Stadium', 'Sports', 'Recreation', 'Exercise', 'Activity'], icon: Stadium },
    { key: 'stars', labels: ['Star', 'Circle', 'Rating', 'Favorite', 'Review'], icon: Stars },
    { key: 'store', labels: ['Store', 'Shop', 'Retail', 'Shopping'], icon: Store },
    { key: 'straighten', labels: ['Ruler', 'Measure', 'Geometry', 'Shape'], icon: Straighten },
    { key: 'stroller', labels: ['Stroller', 'Baby', 'Child', 'Parenting'], icon: Stroller },
    { key: 'style', labels: ['Style', 'Fashion', 'Clothing', 'Appearance'], icon: Style },
    { key: 'subway', labels: ['Subway', 'Train', 'Public Transport', 'Transportation'], icon: Subway },
    { key: 'surfing', labels: ['Surfing', 'Sports', 'Recreation', 'Exercise', 'Activity'], icon: Surfing },
    { key: 'synagogue', labels: ['Synagogue', 'Religion', 'Place of Worship'], icon: Synagogue },
    { key: 'tag', labels: ['Octothorpe', 'Hash', 'Pound', 'Tag'], icon: Tag },
    { key: 'takeout-dining', labels: ['Takeout', 'Food', 'Dining', 'Restaurant'], icon: TakeoutDining },
    { key: 'tapas', labels: ['Tapas', 'Food', 'Dining', 'Restaurant'], icon: Tapas },
    { key: 'temple-buddhist', labels: ['Buddhist Temple', 'Temple', 'Buddhist', 'Religion', 'Place of Worship'], icon: TempleBuddhist },
    { key: 'temple-hindu', labels: ['Hindu Temple', 'Temple', 'Hindu', 'Religion', 'Place of Worship'], icon: TempleHindu },
    { key: 'theater-comedy', labels: ['Masks', 'Comedy', 'Theater', 'Drama', 'Performance'], icon: TheaterComedy },
    { key: 'thumb-down', labels: ['Thumb Down', 'Dislike', 'Negative', 'Vote'], icon: ThumbDown },
    { key: 'thunderstorm', labels: ['Thunderstorm', 'Weather', 'Storm', 'Lightning'], icon: Thunderstorm },
    { key: 'timer', labels: ['Timer', 'Clock', 'Time', 'Countdown'], icon: Timer },
    { key: 'token', labels: ['Token', 'Cryptocurrency', 'Digital Asset'], icon: Token },
    { key: 'tornado', labels: ['Tornado', 'Weather', 'Storm', 'Wind'], icon: Tornado },
    { key: 'toys', labels: ['Toys', 'Play', 'Children', 'Games'], icon: Toys },
    { key: 'traffic', labels: ['Traffic', 'Cars', 'Road', 'Transportation'], icon: Traffic },
    { key: 'train', labels: ['Train', 'Transportation', 'Travel', 'Public Transport'], icon: Train },
    { key: 'tram', labels: ['Tram', 'Transportation', 'Public Transport', 'Travel'], icon: Tram },
    { key: 'transgender', labels: ['Transgender', 'Non-Binary', 'Gender', 'Identity', 'LGBTQ+'], icon: Transgender },
    { key: 'tsunami', labels: ['Tsunami', 'Weather', 'Disaster', 'Wave'], icon: Tsunami },
    { key: 'twitter', labels: ['Bird', 'Twitter', 'Social Media', 'Platform'], icon: Twitter },
    { key: 'umbrella', labels: ['Umbrella', 'Rain', 'Weather', 'Protection'], icon: Umbrella },
    { key: 'vaccines', labels: ['Vaccines', 'Health', 'Medicine', 'Immunization'], icon: Vaccines },
    { key: 'vaping-rooms', labels: ['Vaping', 'Vape', 'Smoking', 'Rooms'], icon: VapingRooms },
    { key: 'verified', labels: ['Verified', 'Check', 'Badge', 'Account'], icon: Verified },
    { key: 'visibility', labels: ['Eye', 'View', 'Visible', 'Sight'], icon: Visibility },
    { key: 'volcano', labels: ['Volcano', 'Mountain', 'Eruption', 'Lava'], icon: Volcano },
    { key: 'volume-up', labels: ['Volume', 'Sound', 'Audio', 'Increase'], icon: VolumeUp },
    { key: 'water-drop', labels: ['Water Drop', 'Rain', 'Weather', 'Liquid'], icon: WaterDrop },
    { key: 'wind-power', labels: ['Wind Power', 'Energy', 'Renewable', 'Sustainable'], icon: WindPower }
    






].sort((a, b) => {
    const aIndex = KEEP_FIRST_ICONS.indexOf(a.key);
    const bIndex = KEEP_FIRST_ICONS.indexOf(b.key);

    if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
    }

    if (aIndex !== -1) {
        return -1;
    }

    if (bIndex !== -1) {
        return 1;
    }

    return a.key.localeCompare(b.key);
});

type RatingIconKey = (typeof RATING_ICON_OPTIONS)[number]['key'];

const resolveIcon = (iconName?: string) => {
    const match = RATING_ICON_OPTIONS.find(option => option.key === iconName);
    return match?.icon || Star;
};

interface IconPickerProps {
    value?: string;
    onChange: (iconName: string | undefined) => void;
    allowClear?: boolean;
    placeholder?: string;
}

export const IconPicker: FC<IconPickerProps> = ({ value, onChange, allowClear = false, placeholder = 'Search icon' }) => {
    const [search, setSearch] = useState('');
    const [isOpen, setIsOpen] = useState(false);

    const filteredOptions = useMemo(() => {
        const query = search.trim().toLowerCase();
        return RATING_ICON_OPTIONS.filter((option) => {
            if (!query) {
                return true;
            }
            return option.labels.join(' ').toLowerCase().includes(query) || option.key.toLowerCase().includes(query);
        });
    }, [search]);

    const selectedValue = value ?? (allowClear ? undefined : 'star');
    const previewIconName = value ?? (allowClear ? undefined : 'star');
    const PreviewIcon = previewIconName ? resolveIcon(previewIconName) : DoNotDisturb;

    const handleSelect = (nextValue?: string) => {
        onChange(nextValue);
        setIsOpen(false);
    };

    const pickerContent = (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
                type="text"
                className="input-base"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={placeholder}
                autoFocus
            />
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(72px, 1fr))',
                    gap: '8px',
                    maxHeight: '320px',
                    overflowY: 'auto',
                    paddingRight: '4px',
                }}
            >
                {allowClear && (
                    <button
                        key="icon-clear"
                        type="button"
                        onClick={() => handleSelect(undefined)}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            background: selectedValue === undefined ? 'color-mix(in srgb, var(--agenda-highlight) 16%, transparent)' : 'var(--agenda-surface-raised)',
                            border: selectedValue === undefined ? '1px solid var(--agenda-highlight)' : '1px solid var(--agenda-line-subtle)',
                            borderRadius: '8px',
                            color: 'var(--agenda-text-primary)',
                            cursor: 'pointer',
                            padding: '10px 8px',
                            minHeight: '72px',
                            fontSize: '11px',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        <DoNotDisturb style={{ fontSize: 24, color: selectedValue === undefined ? 'var(--agenda-highlight)' : 'var(--agenda-text-muted)' }} />
                        <span>None</span>
                    </button>
                )}
                {filteredOptions.map((option) => {
                    const Icon = option.icon;
                    const active = selectedValue === option.key;
                    return (
                        <button
                            key={`icon-${option.key}`}
                            type="button"
                            onClick={() => handleSelect(option.key)}
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                background: active ? 'color-mix(in srgb, var(--agenda-highlight) 16%, transparent)' : 'var(--agenda-surface-raised)',
                                border: active ? '1px solid var(--agenda-highlight)' : '1px solid var(--agenda-line-subtle)',
                                borderRadius: '8px',
                                color: 'var(--agenda-text-primary)',
                                cursor: 'pointer',
                                padding: '10px 8px',
                                minHeight: '72px',
                                fontSize: '11px',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            <Icon style={{ fontSize: 24, color: active ? 'var(--agenda-highlight)' : 'var(--agenda-text-muted)' }} />
                            <span>{option.labels[0]}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );

    return (
        <>
            <button
                type="button"
                onClick={() => setIsOpen(true)}
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: '52px',
                    minHeight: '38px',
                    border: '1px solid var(--agenda-line-subtle)',
                    borderRadius: '8px',
                    background: 'var(--agenda-surface-raised)',
                    color: 'var(--agenda-text-primary)',
                    cursor: 'pointer',
                    padding: '6px 10px',
                }}
                aria-label={value ? `Selected icon: ${value}` : 'Pick an icon'}
            >
                {value ? (
                    <PreviewIcon style={{ fontSize: 22, color: 'var(--agenda-text-primary)' }} />
                ) : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '12px', color: 'var(--agenda-text-muted)' }}>
                        <DoNotDisturb style={{ fontSize: 18 }} />
                        None
                    </span>
                )}
            </button>

            {isOpen && typeof document !== 'undefined' && createPortal(
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'color-mix(in srgb, var(--agenda-surface-base) 72%, transparent)',
                        backdropFilter: 'blur(4px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '20px',
                        zIndex: 2000,
                    }}
                    onClick={() => setIsOpen(false)}
                >
                    <div
                        onClick={(event) => event.stopPropagation()}
                        style={{
                            width: 'min(560px, 100%)',
                            background: 'linear-gradient(135deg, var(--agenda-panel-surface) 0%, color-mix(in srgb, var(--agenda-surface-base) 92%, var(--agenda-panel-surface)) 100%)',
                            border: '1px solid var(--agenda-panel-border)',
                            borderRadius: '12px',
                            padding: '18px',
                            boxShadow: 'var(--agenda-shadow)',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '12px' }}>
                            <div style={{ fontWeight: 700, color: 'var(--agenda-text-primary)' }}>Choose icon</div>
                            <button
                                type="button"
                                onClick={() => setIsOpen(false)}
                                style={{
                                    border: '1px solid var(--agenda-line-subtle)',
                                    borderRadius: '8px',
                                    background: 'var(--agenda-surface-raised)',
                                    color: 'var(--agenda-text-primary)',
                                    cursor: 'pointer',
                                    padding: '6px 10px',
                                }}
                            >
                                Close
                            </button>
                        </div>
                        {pickerContent}
                    </div>
                </div>,
                document.body,
            )}
        </>
    );
};

interface StatRatingProps {
    stat: Stat;
    value: number;
    updateScore?: (value: number) => void;
    readOnly?: boolean;
    style?: React.CSSProperties;
}

const resolvePipCount = (stat: Stat): number => {
    if (Number.isFinite(stat.max)) {
        return Math.max(1, Math.round(Number(stat.max)));
    }

    return 5;
};

const getFilledPipCount = (value: number, maxPips: number): number => {
    if (!Number.isFinite(value)) {
        return 0;
    }

    return Math.max(0, Math.min(maxPips, Math.round(value)));
};

const ratingShellStyle = (interactive: boolean): React.CSSProperties => ({
    position: 'relative',
    width: '100%',
    aspectRatio: '1 / 1',
    display: 'grid',
    placeItems: 'center',
    padding: 0,
    margin: 0,
    border: 0,
    background: 'transparent',
    color: 'var(--agenda-text-muted)',
    cursor: interactive ? 'pointer' : 'default',
    lineHeight: 0,
    overflow: 'visible',
});

const iconStyleBase: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    color: 'inherit',
};

const renderStatIcon = (
    stat: Stat,
    pipValue: number,
    filled: boolean,
    updateScore?: (value: number) => void,
) => {
    const IconComponent = resolveIcon(stat.iconName);
    const label = `${stat.name} ${pipValue} of ${resolvePipCount(stat)}`;
    const fillColor = filled ? (stat.displayColor || 'var(--agenda-highlight)') : 'rgba(11, 17, 28, 0.9)';
    const shadow = filled
        ? `drop-shadow(0 0 2px color-mix(in srgb, ${fillColor} 35%, transparent))`
        : 'drop-shadow(0 0 7px rgba(0, 0, 0, 0.85))';

    return (
        <button
            key={`${stat.name}-pip-${pipValue}`}
            type="button"
            disabled={!updateScore}
            onClick={updateScore ? () => updateScore?.(pipValue) : undefined}
            aria-label={label}
            title={label}
            style={ratingShellStyle(!!updateScore)}
        >
            <IconComponent
                style={{
                    ...iconStyleBase,
                    opacity: filled ? 1 : 0.35,
                    color: fillColor,
                    filter: shadow,
                    transform: filled ? 'none' : 'translateY(1px)',
                }}
            />
        </button>
    );
};

export { RATING_ICON_OPTIONS, resolveIcon, type RatingIconKey };

export const StatRating: FC<StatRatingProps> = ({
    stat,
    value,
    updateScore,
    style,
}) => {
    const maxPips = resolvePipCount(stat);
    const filledPips = getFilledPipCount(value, maxPips);

    if (maxPips <= 10) {
        return (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', ...style }}>
                <div
                    role="img"
                    aria-label={`${stat.name}: ${filledPips} of ${maxPips}`}
                    style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${maxPips}, minmax(0, 1fr))`,
                        gap: '4px',
                        height: '100%',
                        maxWidth: '100%',
                        aspectRatio: `${maxPips} / 1`,
                    }}
                >
                    {Array.from({ length: maxPips }, (_, index) => {
                        const pipValue = index + 1;
                        return renderStatIcon(stat, pipValue, filledPips >= pipValue, updateScore);
                    })}
                </div>
            </div>
        );
    }

    const groups = Array.from({ length: Math.ceil(maxPips / 5) }, (_, groupIndex) => {
        const start = groupIndex * 5 + 1;
        const end = Math.min(start + 4, maxPips);
        return Array.from({ length: end - start + 1 }, (_, index) => start + index);
    });

    return (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start', ...style }}>
        <div
            role="img"
            aria-label={`${stat.name}: ${filledPips} of ${maxPips}`}
            style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${groups.length}, minmax(0, 1fr))`,
                gap: '8px',
                height: '100%',
                maxWidth: '100%',
                aspectRatio: `${groups.length * 3} / 2`,
            }}
        >
            {groups.map((group, groupIndex) => {
                const topPips = group.slice(0, 3);
                const bottomPips = group.slice(3);

                return (
                    <div
                        key={`${stat.name}-group-${groupIndex}`}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '2px',
                            minWidth: 0,
                        }}
                    >
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: `repeat(${Math.max(1, topPips.length)}, minmax(0, 1fr))`,
                                gap: '3px',
                            }}
                        >
                            {topPips.map((pipValue) => renderStatIcon(stat, pipValue, filledPips >= pipValue, updateScore))}
                        </div>

                        {bottomPips.length > 0 && (
                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: `repeat(${bottomPips.length}, minmax(0, 1fr))`,
                                    gap: '3px',
                                    width: '72%',
                                    margin: '-2px auto 0',
                                }}
                            >
                                {bottomPips.map((pipValue) => renderStatIcon(stat, pipValue, filledPips >= pipValue, updateScore))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
        </div>
    );
};