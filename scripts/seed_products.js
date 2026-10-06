const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, '..', 'dev.db');
const db = new Database(dbPath);

console.log('Connecting to database:', dbPath);

// Define the complete 80 products transcribed directly from user's Product Master screenshots
const productsData = [
  // Page 1/4 (Items 1 to 20)
  { code: '2', name: 'CHICKEN DRESSED', paperRate: 240.00, purchaseRate: 0.00, retailRate: 250.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 0, subMaster: 1, wastage: 0.350, category: 'Chicken', unitType: 'weight' },
  { code: '3', name: 'CHICKEN SKINLESS', paperRate: 260.00, purchaseRate: 0.00, retailRate: 260.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 0, subMaster: 1, wastage: 0.550, category: 'Chicken', unitType: 'weight' },
  { code: '4', name: 'SPECIAL CHICKEN', paperRate: 340.00, purchaseRate: 0.00, retailRate: 290.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 0, subMaster: 1, wastage: 0.550, category: 'Chicken', unitType: 'weight' },
  { code: '5', name: 'CHICKEN BONELESS', paperRate: 400.00, purchaseRate: 134.00, retailRate: 400.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 0, subMaster: 1, wastage: 1.350, category: 'Chicken', unitType: 'weight' },
  { code: '6', name: 'CHICKEN LIVER', paperRate: 140.00, purchaseRate: 0.00, retailRate: 150.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 0, subMaster: 1, wastage: 0.000, category: 'Chicken', unitType: 'weight' },
  { code: '7', name: 'CC OG', paperRate: 500.00, purchaseRate: 370.00, retailRate: 550.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Chicken', unitType: 'weight' },
  { code: '8', name: 'CC LIVE', paperRate: 350.00, purchaseRate: 235.00, retailRate: 380.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Chicken', unitType: 'live_dual' },
  { code: '9', name: 'CHICKEN KALL', paperRate: 20.00, purchaseRate: 0.00, retailRate: 30.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 0, subMaster: 1, wastage: 0.450, category: 'Chicken', unitType: 'weight' },
  { code: '10', name: 'QUILS', paperRate: 65.00, purchaseRate: 45.00, retailRate: 65.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Chicken', unitType: 'piece' },
  { code: '11', name: 'MUTTON', paperRate: 960.00, purchaseRate: 870.00, retailRate: 1050.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Mutton', unitType: 'weight' },
  { code: '12', name: 'MUTTON BONELESS', paperRate: 1300.00, purchaseRate: 0.00, retailRate: 1400.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 0, subMaster: 1, wastage: 0.000, category: 'Mutton', unitType: 'weight' },
  { code: '13', name: 'MUTTON BONE', paperRate: 0.00, purchaseRate: 0.00, retailRate: 550.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 0, subMaster: 1, wastage: 0.000, category: 'Mutton', unitType: 'weight' },
  { code: '14', name: 'MUTTON LIVER', paperRate: 900.00, purchaseRate: 600.00, retailRate: 1050.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 0, subMaster: 1, wastage: 0.000, category: 'Mutton', unitType: 'weight' },
  { code: '15', name: 'MUTTON BOTTI', paperRate: 350.00, purchaseRate: 250.00, retailRate: 400.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 0, subMaster: 1, wastage: 0.000, category: 'Mutton', unitType: 'weight' },
  { code: '16', name: 'MUTTON LEG', paperRate: 280.00, purchaseRate: 250.00, retailRate: 400.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 0, subMaster: 1, wastage: 0.000, category: 'Mutton', unitType: 'weight' },
  { code: '17', name: 'MUTTON HEAD', paperRate: 350.00, purchaseRate: 250.00, retailRate: 350.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 0, subMaster: 1, wastage: 0.000, category: 'Mutton', unitType: 'piece' },
  { code: '18', name: 'MUTTON LUNGS', paperRate: 70.00, purchaseRate: 30.00, retailRate: 70.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 0, subMaster: 1, wastage: 0.000, category: 'Mutton', unitType: 'piece' },
  { code: '19', name: 'MUTTON BRAIN', paperRate: 150.00, purchaseRate: 0.00, retailRate: 150.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 0, subMaster: 1, wastage: 0.000, category: 'Mutton', unitType: 'piece' },
  { code: '1', name: 'CHICKEN LIVE', paperRate: 160.00, purchaseRate: 101.00, retailRate: 170.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Chicken', unitType: 'live_dual' },
  { code: '27', name: 'MASALA', paperRate: 0.00, purchaseRate: 1195.00, retailRate: 10.00, wholeRate: 0.00, saleRateType: 'OpenRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Masala', unitType: 'piece' },

  // Page 2/4 (Items 21 to 40)
  { code: '23', name: 'EGG', paperRate: 5.40, purchaseRate: 6.05, retailRate: 6.70, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Eggs', unitType: 'piece' },
  { code: '24', name: 'CC EGG', paperRate: 0.00, purchaseRate: 13.00, retailRate: 15.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Eggs', unitType: 'piece' },
  { code: '64', name: 'DRIED FISH', paperRate: 0.00, purchaseRate: 450.00, retailRate: 20.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Seafood', unitType: 'piece' },
  { code: '31', name: 'BLOOD', paperRate: 80.00, purchaseRate: 30.00, retailRate: 80.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Mutton', unitType: 'piece' },
  { code: '32', name: 'OTHERS', paperRate: 0.00, purchaseRate: 7440.00, retailRate: 0.00, wholeRate: 0.00, saleRateType: 'OpenRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Others', unitType: 'piece' },
  { code: '29', name: 'GINGER GARLIC', paperRate: 5.00, purchaseRate: 4.00, retailRate: 5.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Masala', unitType: 'piece' },
  { code: '30', name: 'SPLEEN', paperRate: 2700.00, purchaseRate: 1600.00, retailRate: 3500.00, wholeRate: 0.00, saleRateType: 'OpenRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Mutton', unitType: 'weight' },
  { code: '25', name: 'QUAIS EGG', paperRate: 55.00, purchaseRate: 45.00, retailRate: 60.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Eggs', unitType: 'piece' },
  { code: '21', name: 'MUTTON PARTS', paperRate: 0.00, purchaseRate: 950.00, retailRate: 900.00, wholeRate: 0.00, saleRateType: 'OpenRate', stockNeed: 1, masterStock: 1, subMaster: 1, wastage: 0.000, category: 'Mutton', unitType: 'weight' },
  { code: '22', name: 'GINGER GARLIC BIG', paperRate: 120.00, purchaseRate: 60.00, retailRate: 120.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Masala', unitType: 'piece' },
  { code: '26', name: 'EGG 1', paperRate: 6.00, purchaseRate: 0.00, retailRate: 192.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Eggs', unitType: 'piece' },
  { code: '28', name: 'TANOORI GRLLI', paperRate: 0.00, purchaseRate: 0.00, retailRate: 0.00, wholeRate: 0.00, saleRateType: 'OpenRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Chicken', unitType: 'piece' },
  { code: '79', name: 'CHICKEN BONE', paperRate: 80.00, purchaseRate: 0.00, retailRate: 80.00, wholeRate: 0.00, saleRateType: 'OpenRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Chicken', unitType: 'weight' },
  { code: '33', name: 'MASALA 1', paperRate: 12.00, purchaseRate: 0.00, retailRate: 12.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Masala', unitType: 'piece' },
  { code: '40', name: 'CHICKEN 65', paperRate: 400.00, purchaseRate: 0.00, retailRate: 500.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Chicken', unitType: 'weight' },
  { code: '41', name: '65 BONELESS', paperRate: 500.00, purchaseRate: 0.00, retailRate: 600.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Chicken', unitType: 'weight' },
  { code: '42', name: 'HALF LEG', paperRate: 50.00, purchaseRate: 0.00, retailRate: 50.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Chicken', unitType: 'piece' },
  { code: '43', name: 'FULL LEG', paperRate: 90.00, purchaseRate: 0.00, retailRate: 110.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Chicken', unitType: 'piece' },
  { code: '45', name: 'FISH FIY', paperRate: 0.00, purchaseRate: 0.00, retailRate: 0.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Seafood', unitType: 'weight' },
  { code: '46', name: 'LOLLY POP', paperRate: 100.00, purchaseRate: 0.00, retailRate: 110.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Chicken', unitType: 'piece' },

  // Page 3/4 (Items 41 to 60)
  { code: '47', name: 'KADAI 65', paperRate: 80.00, purchaseRate: 0.00, retailRate: 110.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Chicken', unitType: 'piece' },
  { code: '20', name: 'TRANSPORT', paperRate: 0.00, purchaseRate: 0.00, retailRate: 0.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Others', unitType: 'piece' },
  { code: '34', name: 'MUTTON KEEMA', paperRate: 1300.00, purchaseRate: 0.00, retailRate: 1250.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Mutton', unitType: 'weight' },
  { code: '100', name: 'FREE EGG', paperRate: 0.00, purchaseRate: 0.00, retailRate: 0.01, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Eggs', unitType: 'piece' },
  { code: '101', name: 'CARRY BAG 10X14- BLACK', paperRate: 0.00, purchaseRate: 115.00, retailRate: 0.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Supplies', unitType: 'piece' },
  { code: '102', name: 'CARRY BAG 13X16- BLACK', paperRate: 0.00, purchaseRate: 115.00, retailRate: 0.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Supplies', unitType: 'piece' },
  { code: '103', name: 'PAAL COVER SMALL/BIG', paperRate: 0.00, purchaseRate: 165.00, retailRate: 0.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Supplies', unitType: 'piece' },
  { code: '104', name: 'PRINTER ROLL', paperRate: 0.00, purchaseRate: 40.00, retailRate: 0.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Supplies', unitType: 'piece' },
  { code: '105', name: 'CARRY BAG - SMALL- WHITE', paperRate: 0.00, purchaseRate: 9.00, retailRate: 0.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Supplies', unitType: 'piece' },
  { code: '106', name: 'SAKTHI TURMERIC- 50GM', paperRate: 0.00, purchaseRate: 10.71, retailRate: 0.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Masala', unitType: 'piece' },
  { code: '107', name: 'SAKTHI CHILLY - 50 GM', paperRate: 0.00, purchaseRate: 11.43, retailRate: 0.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Masala', unitType: 'piece' },
  { code: '108', name: 'SAKTHI CORIANDER - 50 GM', paperRate: 0.00, purchaseRate: 8.10, retailRate: 0.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Masala', unitType: 'piece' },
  { code: '109', name: 'SAKTHI CUMIN - 50 GM', paperRate: 0.00, purchaseRate: 20.24, retailRate: 0.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Masala', unitType: 'piece' },
  { code: '110', name: 'SAKTHI PEPPER - 50 GM', paperRate: 0.00, purchaseRate: 47.14, retailRate: 0.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Masala', unitType: 'piece' },
  { code: '113', name: 'SAKTHI GARAM- 50 GM', paperRate: 0.00, purchaseRate: 20.71, retailRate: 0.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Masala', unitType: 'piece' },
  { code: '114', name: 'SAKTHI CHICKEN - 50 GM', paperRate: 0.00, purchaseRate: 13.10, retailRate: 0.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Masala', unitType: 'piece' },
  { code: '115', name: 'SAKTHI CHILLI 65- 50 GM', paperRate: 0.00, purchaseRate: 20.48, retailRate: 0.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Masala', unitType: 'piece' },
  { code: '116', name: 'SAKTHI MUTTON - 50 GM', paperRate: 0.00, purchaseRate: 17.86, retailRate: 0.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Masala', unitType: 'piece' },
  { code: '117', name: 'SAKTHI KULAMBU - 50 GM', paperRate: 0.00, purchaseRate: 10.71, retailRate: 0.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Masala', unitType: 'piece' },
  { code: '118', name: 'SAKTHI CHICKEN - 20 GM', paperRate: 0.00, purchaseRate: 6.19, retailRate: 0.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Masala', unitType: 'piece' },

  // Page 4/4 (Items 61 to 80)
  { code: '119', name: 'SAKTHI CHILLI 65 - 20 GM', paperRate: 0.00, purchaseRate: 7.62, retailRate: 0.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Masala', unitType: 'piece' },
  { code: '120', name: 'SAKTHI BIRIYANI - 20 GM', paperRate: 0.00, purchaseRate: 9.52, retailRate: 0.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Masala', unitType: 'piece' },
  { code: '121', name: 'SAKTHI FISH - 20 GM', paperRate: 0.00, purchaseRate: 6.66, retailRate: 0.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Masala', unitType: 'piece' },
  { code: '122', name: 'SAKTHI CHILLY - 20 GM', paperRate: 0.00, purchaseRate: 5.71, retailRate: 0.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Masala', unitType: 'piece' },
  { code: '123', name: 'SAKTHI CURRY - 50 GM', paperRate: 0.00, purchaseRate: 17.38, retailRate: 0.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Masala', unitType: 'piece' },
  { code: '124', name: 'PHENOIL', paperRate: 0.00, purchaseRate: 150.00, retailRate: 0.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Supplies', unitType: 'piece' },
  { code: '125', name: 'SOAP OIL', paperRate: 0.00, purchaseRate: 25.00, retailRate: 0.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Supplies', unitType: 'piece' },
  { code: '126', name: 'SAKTHI CORIANDER - 20GM', paperRate: 0.00, purchaseRate: 3.81, retailRate: 0.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Masala', unitType: 'piece' },
  { code: '127', name: 'SAKTHI GARAM - 20GM', paperRate: 0.00, purchaseRate: 8.58, retailRate: 0.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Masala', unitType: 'piece' },
  { code: '128', name: 'SAKTHI TUMERIC - 20GM', paperRate: 0.00, purchaseRate: 4.75, retailRate: 0.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Masala', unitType: 'piece' },
  { code: '129', name: 'SAKTHI CURRY - 20 GM', paperRate: 0.00, purchaseRate: 6.67, retailRate: 0.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Masala', unitType: 'piece' },
  { code: '130', name: 'SAKTHI PEPPER - 10GM', paperRate: 0.00, purchaseRate: 11.43, retailRate: 0.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Masala', unitType: 'piece' },
  { code: '131', name: 'BOTTI', paperRate: 100.00, purchaseRate: 80.00, retailRate: 100.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Mutton', unitType: 'weight' },
  { code: '48', name: 'CC DRESSED', paperRate: 245.00, purchaseRate: 220.00, retailRate: 450.00, wholeRate: 0.00, saleRateType: 'OpenRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Chicken', unitType: 'weight' },
  { code: '132', name: 'SAKTHI EGG MASALA - 50 GM', paperRate: 20.72, purchaseRate: 20.72, retailRate: 20.72, wholeRate: 0.00, saleRateType: 'OpenRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Masala', unitType: 'piece' },
  { code: '133', name: 'BIG WHITE CARRY BAG -16X20', paperRate: 115.00, purchaseRate: 115.00, retailRate: 115.00, wholeRate: 115.00, saleRateType: 'OpenRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Supplies', unitType: 'piece' },
  { code: '51', name: 'CHICKEN DRESSED', paperRate: 111.00, purchaseRate: 103.00, retailRate: 240.00, wholeRate: 240.00, saleRateType: 'OpenRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Chicken', unitType: 'weight' },
  { code: '52', name: 'CHICKEN SKINLESS', paperRate: 111.00, purchaseRate: 103.00, retailRate: 260.00, wholeRate: 260.00, saleRateType: 'OpenRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Chicken', unitType: 'weight' },
  { code: '99', name: 'QUAIL EGG', paperRate: 50.00, purchaseRate: 50.00, retailRate: 60.00, wholeRate: 55.00, saleRateType: 'OpenRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Eggs', unitType: 'piece' },
  { code: '147', name: 'MUTTON SPL', paperRate: 1000.00, purchaseRate: 820.00, retailRate: 1200.00, wholeRate: 0.00, saleRateType: 'FixedRate', stockNeed: 1, masterStock: 1, subMaster: 0, wastage: 0.000, category: 'Mutton', unitType: 'weight' },
];

console.log(`Loaded ${productsData.length} products to seed.`);

// First disable foreign keys outside of transaction
db.pragma('foreign_keys = OFF');

console.log('Cleaning up old test data referencing products and variants...');

// Clear tables in reverse dependency order
const tablesToClear = [
  'invoice_items',
  'payments',
  'invoices',
  'stock_transactions',
  'inventory_ledger',
  'stock_ledger',
  'stock_adjustments',
  'physical_stock_audit_items',
  'physical_stock_audit_sessions',
  'oversold_unreconciled',
  'yield_processing_outputs',
  'yield_processing_runs',
  'refrigerator_removal_events',
  'refrigerator_stock',
  'product_stock_batches',
  'processing_events',
  'live_chicken_batch_adjustments',
  'live_chicken_batches',
  'deleted_products_archive',
  'product_variant_rate_history',
  'goods_receipt_items',
  'goods_receipts',
  'purchase_invoice_items',
  'purchase_invoices',
  'purchase_order_items',
  'purchase_orders',
  'supplier_price_history',
  'supplier_ledger',
  'product_variants',
  'products'
];

for (const table of tablesToClear) {
  try {
    db.prepare(`DELETE FROM ${table}`).run();
    console.log(`Cleared table: ${table}`);
  } catch (e) {
    console.warn(`Note: Could not clear ${table}: ${e.message}`);
  }
}

// Check if we need to add columns to products / product_variants for paper_rate, wholesale_rate, sale_rate_type
const prodCols = db.pragma('table_info(products)').map(c => c.name);
if (!prodCols.includes('paper_rate_paise')) {
  try { db.prepare('ALTER TABLE products ADD COLUMN paper_rate_paise INTEGER DEFAULT 0').run(); } catch(e){}
}
if (!prodCols.includes('wholesale_rate_paise')) {
  try { db.prepare('ALTER TABLE products ADD COLUMN wholesale_rate_paise INTEGER DEFAULT 0').run(); } catch(e){}
}
if (!prodCols.includes('sale_rate_type')) {
  try { db.prepare("ALTER TABLE products ADD COLUMN sale_rate_type TEXT DEFAULT 'FixedRate'").run(); } catch(e){}
}
if (!prodCols.includes('is_master_stock_item')) {
  try { db.prepare('ALTER TABLE products ADD COLUMN is_master_stock_item INTEGER DEFAULT 1').run(); } catch(e){}
}
if (!prodCols.includes('wastage')) {
  try { db.prepare('ALTER TABLE products ADD COLUMN wastage REAL DEFAULT 0.0').run(); } catch(e){}
}

const varCols = db.pragma('table_info(product_variants)').map(c => c.name);
if (!varCols.includes('paper_rate_paise')) {
  try { db.prepare('ALTER TABLE product_variants ADD COLUMN paper_rate_paise INTEGER DEFAULT 0').run(); } catch(e){}
}
if (!varCols.includes('wholesale_rate_paise')) {
  try { db.prepare('ALTER TABLE product_variants ADD COLUMN wholesale_rate_paise INTEGER DEFAULT 0').run(); } catch(e){}
}
if (!varCols.includes('sale_rate_type')) {
  try { db.prepare("ALTER TABLE product_variants ADD COLUMN sale_rate_type TEXT DEFAULT 'FixedRate'").run(); } catch(e){}
}

// Prepared insert statements
const insertProductStmt = db.prepare(`
  INSERT INTO products (
    product_code, name, unit_type, category, is_processed_cut,
    is_active, stock_classification, subcategory, is_inventory_tracked,
    paper_rate_paise, wholesale_rate_paise, sale_rate_type, is_master_stock_item, wastage
  ) VALUES (
    @product_code, @name, @unit_type, @category, @is_processed_cut,
    1, @stock_classification, '', @is_inventory_tracked,
    @paper_rate_paise, @wholesale_rate_paise, @sale_rate_type, @is_master_stock_item, @wastage
  )
`);

const insertVariantStmt = db.prepare(`
  INSERT INTO product_variants (
    product_id, variant_name, product_code, current_rate_paise_per_unit,
    cost_price_paise_per_unit, last_purchase_cost, last_purchase_cost_paise,
    unit_cost_paise_cache, is_active, track_in_inventory, unit_type,
    is_processed_cut, yield_ratio, paper_rate_paise, wholesale_rate_paise, sale_rate_type
  ) VALUES (
    @product_id, @variant_name, @product_code, @current_rate_paise_per_unit,
    @cost_price_paise_per_unit, @last_purchase_cost, @last_purchase_cost_paise,
    @unit_cost_paise_cache, 1, @track_in_inventory, @unit_type,
    @is_processed_cut, @yield_ratio, @paper_rate_paise, @wholesale_rate_paise, @sale_rate_type
  )
`);

const insertRateHistoryStmt = db.prepare(`
  INSERT INTO product_variant_rate_history (
    product_variant_id, rate_paise_per_unit, effective_from, set_by
  ) VALUES (
    @product_variant_id, @rate_paise_per_unit, CURRENT_TIMESTAMP, 1
  )
`);

// Get admin user ID for history set_by
const user = db.prepare("SELECT id FROM users LIMIT 1").get();
const userId = user ? user.id : 1;

console.log('Inserting 80 products...');
const insertAll = db.transaction(() => {
  for (const item of productsData) {
    const retailPaise = Math.round(item.retailRate * 100);
    const purchasePaise = Math.round(item.purchaseRate * 100);
    const paperPaise = Math.round(item.paperRate * 100);
    const wholePaise = Math.round(item.wholeRate * 100);
    const stockClass = item.unitType === 'live_dual' ? 'live_yield' : 'refrigerator_direct';

    const prodResult = insertProductStmt.run({
      product_code: item.code,
      name: item.name,
      unit_type: item.unitType,
      category: item.category,
      is_processed_cut: item.subMaster,
      stock_classification: stockClass,
      is_inventory_tracked: item.stockNeed,
      paper_rate_paise: paperPaise,
      wholesale_rate_paise: wholePaise,
      sale_rate_type: item.saleRateType,
      is_master_stock_item: item.masterStock,
      wastage: item.wastage
    });

    const productId = prodResult.lastInsertRowid;

    const varResult = insertVariantStmt.run({
      product_id: productId,
      variant_name: item.name,
      product_code: item.code,
      current_rate_paise_per_unit: retailPaise,
      cost_price_paise_per_unit: purchasePaise,
      last_purchase_cost: purchasePaise,
      last_purchase_cost_paise: purchasePaise,
      unit_cost_paise_cache: purchasePaise,
      track_in_inventory: item.stockNeed,
      unit_type: item.unitType,
      is_processed_cut: item.subMaster,
      yield_ratio: item.wastage,
      paper_rate_paise: paperPaise,
      wholesale_rate_paise: wholePaise,
      sale_rate_type: item.saleRateType
    });

    const variantId = varResult.lastInsertRowid;

    insertRateHistoryStmt.run({
      product_variant_id: variantId,
      rate_paise_per_unit: retailPaise
    });
  }
});

insertAll();

// Re-enable FK constraints
db.pragma('foreign_keys = ON');

const count = db.prepare('SELECT count(*) as c FROM products').get().c;
const vCount = db.prepare('SELECT count(*) as c FROM product_variants').get().c;
const hCount = db.prepare('SELECT count(*) as c FROM product_variant_rate_history').get().c;
console.log(`SUCCESS! Total products in DB: ${count}, Total variants: ${vCount}, Rate histories: ${hCount}`);

db.close();
