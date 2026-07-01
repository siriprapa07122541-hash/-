/**
 * Google Apps Script for Anesthesia Drug Registry and Special Controlled Drugs
 * 
 * INSTRUCTIONS FOR USER (วิธีใช้งาน):
 * 1. เปิด Google Sheets ที่คุณต้องการบันทึกข้อมูล (SHEET ID: 12akwFyMHjCb2QUG6HiMsagkwaPT2qpU5-kbQ_Z3OkmY)
 * 2. ไปที่เมนู "ส่วนขยาย" (Extensions) > "Apps Script"
 * 3. ลบโค้ดเก่าในไฟล์ Code.gs ออกทั้งหมด แล้วนำโค้ดด้านล่างนี้ไปวางแทนที่
 * 4. แก้ไขตัวแปร SPREADSHEET_ID ด้านล่างให้ตรงกับ Google Sheet ของคุณ
 * 5. คลิกปุ่ม "บันทึก" (รูปแผ่นดิสก์)
 * 6. คลิกปุ่ม "การทำให้ใช้งานได้" (Deploy) > "การจัดการการทำให้ใช้งานได้ใหม่" (New deployment)
 * 7. เลือกประเภทเป็น "เว็บแอป" (Web app)
 * 8. ตั้งค่าดังนี้:
 *    - Execute as (เรียกใช้ในฐานะ): "Me" (บัญชีอีเมลของคุณเอง)
 *    - Who has access (ผู้มีสิทธิ์เข้าถึง): "Anyone" (ทุกคน) *สำคัญมาก เพื่อให้แอปเชื่อมต่อได้*
 * 9. คลิก "การทำให้ใช้งานได้" (Deploy) และให้สิทธิ์เข้าถึง (Authorize Access) กับบัญชีของคุณ
 * 10. คัดลอก URL ของเว็บแอป (Web app URL) ที่ได้ ไปใส่ในส่วนของ appsScriptUrl ในแอปพลิเคชัน
 */

// ระบุ Spreadsheet ID ของคุณตรงนี้เพื่อเป็นค่าเริ่มต้นความปลอดภัย
var SPREADSHEET_ID = "12akwFyMHjCb2QUG6HiMsagkwaPT2qpU5-kbQ_Z3OkmY";

/**
 * ฟังก์ชันหลักสำหรับรองรับ HTTP POST
 * บันทึกข้อมูลแบบ JSON จากทุกหน้าจอแยกตามแท็บ Sheet: "เบิกยา", "คืนยา", "ยาควบคุมพิเศษ"
 */
function doPost(e) {
  // เปิดระบบ Lock ป้องกันปัญหาระเบียนซ้อนทับกันเมื่อมีการบันทึกพร้อมกัน (Concurrency control)
  var lock = LockService.getScriptLock();
  try {
    // รอ Lock สิทธิ์เขียนนานสูงสุด 30 วินาที
    lock.waitLock(30000);
    
    // ตรวจสอบและดึงข้อมูลดิบจากคำขอ (Raw JSON body)
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("ไม่พบข้อมูลสำหรับการบันทึก (No post data received)");
    }
    
    var payload = JSON.parse(e.postData.contents);
    var sheetId = payload.sheetId || SPREADSHEET_ID;
    var targetSheetName = payload.target; // "เบิกยา" | "คืนยา" | "ยาควบคุมพิเศษ"
    var rows = payload.rows; // รายการข้อมูลแถวทั้งหมด (Array of objects)
    
    if (!sheetId) {
      throw new Error("กรุณาระบุ Spreadsheet ID");
    }
    if (!targetSheetName) {
      throw new Error("กรุณาระบุชื่อ Sheet ปลายทาง (target)");
    }
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      throw new Error("ไม่พบแถวข้อมูลหรือรูปแบบ rows ไม่ถูกต้อง");
    }
    
    // เปิดสเปรดชีต
    var ss = SpreadsheetApp.openById(sheetId);
    var sheet = ss.getSheetByName(targetSheetName);
    
    // หากไม่มีชีทนี้ในสเปรดชีต ให้สร้างขึ้นมาใหม่โดยอัตโนมัติ
    if (!sheet) {
      sheet = ss.insertSheet(targetSheetName);
    }
    
    // ตรวจสอบคอลัมน์หัวตารางที่มีอยู่ในปัจจุบัน (Row 1)
    var lastColumn = sheet.getLastColumn();
    var headers = [];
    if (lastColumn > 0) {
      headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
    }
    
    // สรุปชุดคอลัมน์มาตรฐานตามที่โจทย์กำหนด (Preferred Headers Order)
    var preferredOrder = [];
    if (targetSheetName === "เบิกยา") {
      preferredOrder = ["Timestamp", "DrugName", "HN", "PatientName", "UsedAmount", "WastageAmount", "NurseName", "WitnessName"];
    } else if (targetSheetName === "คืนยา") {
      preferredOrder = ["Timestamp", "ShiftName", "ExpectedStock", "PhysicalStock", "AmpouleCount", "Status", "SenderName", "ReceiverName"];
    } else if (targetSheetName === "ยาควบคุมพิเศษ") {
      preferredOrder = ["Timestamp", "ReturnQty", "ReturnedBy", "ReceivedByRoomยา"];
    }
    
    // รวบรวมคีย์ทั้งหมดที่ส่งเข้ามาในรอบนี้
    var keysInPayload = {};
    rows.forEach(function(row) {
      Object.keys(row).forEach(function(k) {
        keysInPayload[k] = true;
      });
    });
    
    // จัดกลุ่มคอลัมน์สุดท้ายที่จะเขียนลงในแถวที่ 1
    var finalHeaders = headers.slice();
    if (finalHeaders.length === 0) {
      finalHeaders = preferredOrder.slice();
    }
    
    // ตรวจหาหัวคอลัมน์ใหม่ๆ ที่ไม่มีในตารางเดิมแล้วทำการ append ต่อท้าย
    Object.keys(keysInPayload).forEach(function(key) {
      if (finalHeaders.indexOf(key) === -1) {
        finalHeaders.push(key);
      }
    });
    
    // เขียนหัวตารางลงแถวที่ 1 หากตารางยังเป็นหน้าว่าง หรือพบคอลัมน์ใหม่เพิ่มขึ้นมา
    if (headers.length !== finalHeaders.length) {
      sheet.getRange(1, 1, 1, finalHeaders.length).setValues([finalHeaders]);
      
      // ตกแต่งแถวหัวตารางให้อ่านง่าย สวยงาม น่าใช้งาน
      var headerRange = sheet.getRange(1, 1, 1, finalHeaders.length);
      headerRange.setFontWeight("bold")
                 .setBackground("#E0F2FE") // สีพาสเทลฟ้าสว่างสะอาดตา
                 .setFontColor("#0369A1") // สีน้ำเงินมหาสมุทรเข้ม
                 .setHorizontalAlignment("center")
                 .setVerticalAlignment("middle");
      
      sheet.setFrozenRows(1);
    }
    
    // แปลงโครงสร้างวัตถุ JSON แต่ละแถวให้สอดคล้องตามลำดับหัวข้อคอลัมน์
    var mappedRowsData = rows.map(function(row) {
      return finalHeaders.map(function(header) {
        var val = row[header];
        return (val === undefined || val === null) ? "" : val;
      });
    });
    
    // นำแถวข้อมูลทั้งหมดเขียนแบบ Bulk Write ลงชีต (เร็วกว่าการค่อยๆ append ทีละแถวมาก)
    var startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, mappedRowsData.length, finalHeaders.length).setValues(mappedRowsData);
    
    // จัดขนาดความกว้างคอลัมน์ให้พอดีกับความยาวอักษรอัตโนมัติ เพื่อความเรียบร้อยสวยงาม
    try {
      sheet.autoResizeColumns(1, finalHeaders.length);
    } catch (resizeErr) {}
    
    // ส่งผลลัพธ์สำเร็จในรูปแบบ JSON
    var responseOutput = {
      status: "success",
      message: "บันทึกข้อมูลเรียบร้อยแล้ว " + mappedRowsData.length + " แถว ลงในชีท " + targetSheetName,
      timestamp: new Date().toISOString()
    };
    
    return ContentService.createTextOutput(JSON.stringify(responseOutput))
                         .setMimeType(ContentService.MimeType.JSON);
                         
  } catch (error) {
    var errorOutput = {
      status: "error",
      message: error.toString()
    };
    return ContentService.createTextOutput(JSON.stringify(errorOutput))
                         .setMimeType(ContentService.MimeType.JSON);
  } finally {
    // ปลดล็อกระบบเพื่ออนุญาตให้คำขอถัดไปเข้าทำงานได้ทันที
    lock.releaseLock();
  }
}

/**
 * ฟังก์ชัน doGet รองรับ HTTP GET และการทำงานผ่าน JSONP (Legacy Resilience)
 */
function doGet(e) {
  var params = e.parameter;
  var callback = params.callback || "callback";
  
  try {
    var sheetId = params.sheetId || SPREADSHEET_ID;
    if (!sheetId) {
      throw new Error("Missing 'sheetId' parameter.");
    }
    
    // SUPPORT FOR READING TRANSACTIONS & AUTO-POLLING SYNC
    if (params.action === "read" || params.action === "get_transactions") {
      var ss = SpreadsheetApp.openById(sheetId);
      var result = {
        status: "success",
        sheets: {}
      };
      
      var targetSheets = ["เบิกยา", "คืนยา", "ยาควบคุมพิเศษ"];
      targetSheets.forEach(function(sName) {
        var s = ss.getSheetByName(sName);
        if (s) {
          var lastRow = s.getLastRow();
          var lastCol = s.getLastColumn();
          if (lastRow > 1 && lastCol > 0) {
            var headers = s.getRange(1, 1, 1, lastCol).getValues()[0];
            var values = s.getRange(2, 1, lastRow - 1, lastCol).getValues();
            var rows = values.map(function(rowValues) {
              var rowObj = {};
              headers.forEach(function(header, idx) {
                rowObj[header] = rowValues[idx];
              });
              return rowObj;
            });
            result.sheets[sName] = rows;
          } else {
            result.sheets[sName] = [];
          }
        } else {
          result.sheets[sName] = [];
        }
      });
      
      return ContentService.createTextOutput(callback + "(" + JSON.stringify(result) + ")")
                           .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    
    var sheetName = params.sheetName || "บันทึกการเบิกคืนยา";
    var ss = SpreadsheetApp.openById(sheetId);
    var sheet = ss.getSheetByName(sheetName);
    
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }
    
    var excludeKeys = ["callback", "_", "sheetId", "sheetName"];
    var lastColumn = sheet.getLastColumn();
    var headers = [];
    if (lastColumn > 0) {
      headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
    }
    
    var requestKeys = Object.keys(params).filter(function(key) {
      return excludeKeys.indexOf(key) === -1;
    });
    
    var preferredOrder = [
      "วัน-เวลา",
      "timestamp",
      "ห้อง OR / แผนก",
      "orRoom",
      "ชื่อ-นามสกุล หรือ HN ผู้ป่วย",
      "patientHN",
      "ชื่อผู้บันทึก / ผู้เบิก",
      "requester",
      "ประเภทการทำรายการ",
      "action",
      "สรุปรายการยาที่เบิก",
      "itemsText",
      "สรุปรายการใช้ยาควบคุมพิเศษทั้งหมด",
      "specialControlledDrugsText",
      "หมายเหตุเพิ่มเติม",
      "notes"
    ];
    
    requestKeys.sort(function(a, b) {
      var idxA = preferredOrder.indexOf(a);
      var idxB = preferredOrder.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });
    
    var headersUpdated = false;
    requestKeys.forEach(function(key) {
      if (headers.indexOf(key) === -1) {
        headers.push(key);
        headersUpdated = true;
      }
    });
    
    if (headersUpdated) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      var headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setFontWeight("bold")
                 .setBackground("#E0F2FE")
                 .setFontColor("#0369A1")
                 .setHorizontalAlignment("center")
                 .setVerticalAlignment("middle");
      sheet.setFrozenRows(1);
    }
    
    var rowData = headers.map(function(header) {
      var val = params[header];
      return (val === undefined || val === null) ? "" : val;
    });
    
    sheet.appendRow(rowData);
    
    try {
      sheet.autoResizeColumns(1, headers.length);
    } catch (resizeErr) {}
    
    var responseOutput = {
      status: "success",
      message: "บันทึกข้อมูลเรียบร้อยแล้วในชีท: " + sheetName,
      timestamp: new Date().toISOString()
    };
    
    return ContentService.createTextOutput(callback + "(" + JSON.stringify(responseOutput) + ")")
                         .setMimeType(ContentService.MimeType.JAVASCRIPT);
                         
  } catch (error) {
    var errorOutput = {
      status: "error",
      message: error.toString()
    };
    return ContentService.createTextOutput(callback + "(" + JSON.stringify(errorOutput) + ")")
                         .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
}
