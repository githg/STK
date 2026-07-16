// Code.gs

function doPost(e) {
  try {
    // Check if post data exists
    if (typeof e === 'undefined' || !e.postData || !e.postData.contents) {
      return createJsonResponse({ status: 'error', message: 'No payload provided' }, 400);
    }
    
    // Parse the JSON payload
    var payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return createJsonResponse({ status: 'error', message: 'Invalid JSON payload' }, 400);
    }
    
    var name = payload.name;
    var department = payload.department;
    var items = payload.items; // Array of objects
    
    if (!name || !department || !items || !Array.isArray(items)) {
      return createJsonResponse({ status: 'error', message: 'Missing name, department, or items' }, 400);
    }
    
    var sheetName = name + ":" + department;
    
    // 1. Get the active spreadsheet
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // 2. Look for the tab, create if it doesn't exist
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      // Initialize Headers for new sheet
      sheet.appendRow(["ID", "UI_SN", "Number", "Name", "Qty", "Remarks", "Timestamp"]);
      sheet.getRange("A1:G1").setFontWeight("bold");
      sheet.setFrozenRows(1);
    }
    
    // 3. Upsert Logic
    var dataRange = sheet.getDataRange();
    var values = dataRange.getValues();
    
    // Create a map of ID -> Row Index (0-indexed based on the 'values' array, meaning row 1 is index 0)
    var idRowMap = {};
    for (var i = 1; i < values.length; i++) { // Skip header at i=0
      var rowId = String(values[i][0]);
      if (rowId) {
        idRowMap[rowId] = i; // Store the array index
      }
    }
    
    // Process incoming items
    for (var j = 0; j < items.length; j++) {
      var item = items[j];
      var itemId = String(item.id);
      
      var timestamp = new Date();
      
      if (idRowMap.hasOwnProperty(itemId)) {
        // ID exists -> Update Qty and Remarks
        // Sheet rows are 1-indexed. The array index 'i' maps to sheet row 'i + 1'
        var sheetRowIndex = idRowMap[itemId] + 1;
        
        // Update Qty (Col E, which is 5) and Remarks (Col F, which is 6), Timestamp (Col G, which is 7)
        sheet.getRange(sheetRowIndex, 5).setValue(item.qty);
        sheet.getRange(sheetRowIndex, 6).setValue(item.remarks || "");
        sheet.getRange(sheetRowIndex, 7).setValue(timestamp);
      } else {
        // ID does not exist -> Append Row
        sheet.appendRow([
          item.id,
          item.ui_sn,
          item.number,
          item.name || "",
          item.qty,
          item.remarks || "",
          timestamp
        ]);
        
        // Update map just in case there are duplicates within the same batch (unlikely due to front-end local dedup, but safe)
        idRowMap[itemId] = values.length; 
        values.push([]); // Keep map array length aligned if needed, though appendRow handles it in sheet
      }
    }
    
    return createJsonResponse({ status: 'success', message: 'Processed ' + items.length + ' items' });
    
  } catch (err) {
    return createJsonResponse({ status: 'error', message: err.toString() }, 500);
  }
}

// Handle GET requests (to verify deployment is active)
function doGet(e) {
  return HtmlService.createHtmlOutput('Stock Counter GAS Backend is Active.');
}

// Helper function to return JSON responses with CORS headers
// Note: With text/plain preflight bypass in JS, GAS still needs JSON output
function createJsonResponse(data, statusCode) {
  var output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
