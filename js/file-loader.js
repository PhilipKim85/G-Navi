/**
 * file-loader.js - 엑셀 파일 읽기 + 파싱
 */

/**
 * 엑셀 파일에서 경유지 주소 목록 파싱
 * 첫 번째 칼럼: 주소 (필수)
 * 두 번째 칼럼: 메모 (선택)
 * @param {File} file - 엑셀 파일
 * @returns {Promise<Array<{address: string, memo: string}>>}
 */
function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        if (rows.length === 0) {
          reject(new Error('엑셀 파일이 비어있습니다.'));
          return;
        }

        // 첫 행이 헤더인지 판별 (주소, 도로명 등 키워드 포함 여부)
        const firstRow = rows[0];
        const headerKeywords = ['주소', '도로명', 'address', '경유지', '방문지'];
        const hasHeader = firstRow.some(cell =>
          headerKeywords.some(kw => String(cell || '').includes(kw))
        );

        const startRow = hasHeader ? 1 : 0;
        const items = [];

        for (let i = startRow; i < rows.length; i++) {
          const row = rows[i];
          if (!row || !row[0]) continue;
          const address = String(row[0]).trim();
          if (!address) continue;
          items.push({
            address: address,
            memo: row[1] ? String(row[1]).trim() : ''
          });
        }

        if (items.length === 0) {
          reject(new Error('유효한 주소 데이터가 없습니다.'));
          return;
        }

        resolve(items);
      } catch (err) {
        reject(new Error('엑셀 파일 읽기 오류: ' + err.message));
      }
    };
    reader.onerror = () => reject(new Error('파일 읽기 실패'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * 엑셀 양식 다운로드 (빈 양식)
 */
function downloadTemplate() {
  const templateData = [
    { '주소': '충청북도 충주시 을지로 21', '메모': '충주시청 (예시)' },
    { '주소': '', '메모': '' }
  ];
  const ws = XLSX.utils.json_to_sheet(templateData);
  ws['!cols'] = [{ wch: 40 }, { wch: 20 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '경유지');
  XLSX.writeFile(wb, 'G-Navi_경유지양식.xlsx');
}
