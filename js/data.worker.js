// js/data.worker.js
self.onmessage = function (e) {
    const { rawData, filterParams, database } = e.data;
    const { countryVal, sourceVal, startVal, endVal, isCompare, isCsatOnly, isTestMode } = filterParams;

    let processedRawData = [];

    // --- Determine which DB key to use and prepare processedRawData ---
    if (isTestMode) {
        processedRawData = database.Test_Sheet ? database.Test_Sheet.data : [];
    } else if (countryVal === 'All') {
        processedRawData = [];
        if (sourceVal == "Widget") {
            processedRawData = processedRawData.concat(database.Master.data);
            processedRawData = processedRawData.concat(database.KSA_Widget.data);
            processedRawData = processedRawData.concat(database.UAE_Widget.data);
            processedRawData = processedRawData.concat(database.ZA_Widget.data);
        } else if (sourceVal == "Whatsapp") {
            processedRawData = processedRawData.concat(
                database.KSA_Whatsapp.data,
                database.UAE_Whatsapp.data,
                database.ZA_Whatsapp.data
            );
        }
    } else {
        const key = `${countryVal}_${sourceVal}`;
        const entry = database[key];
        processedRawData = entry ? entry.data : [];
    }

    // --- Main Filter Logic ---
    const filteredData = processedRawData.filter(row => {
        const rowDateStr = row['First message date'] || row['first_message_date'] || '';
        const rowDate = new Date(rowDateStr);

        const rowCountry = row['Country'] || 'All';

        const dateValid = rowDate >= new Date(startVal) && rowDate <= new Date(endVal);
        const countryValid = (countryVal === 'All') ? true : (rowCountry === countryVal || rowCountry.startsWith(countryVal));

        let csatValid = true;
        if (isCsatOnly) {
            const c = parseInt(row['C-sat']);
            csatValid = !isNaN(c) && c >= 1 && c <= 5;
        }

        return dateValid && countryValid && csatValid;
    });

    // --- Previous Period Data (For Comparison) ---
    let prevData = [];
    if (isCompare) {
        const dayDiff = (new Date(endVal) - new Date(startVal)) / (1000 * 60 * 60 * 24);
        const prevStart = new Date(startVal);
        prevStart.setDate(prevStart.getDate() - dayDiff);
        const prevEnd = new Date(startVal);
        prevEnd.setHours(23, 59, 59, 999); // Ensure full day for previous end

        prevData = processedRawData.filter(row => {
            const rDate = new Date(row['First message date']);
            return rDate >= prevStart && rDate < prevEnd;
        });
    }

    // --- KPI Calculations ---
    const total = filteredData.length;
    const prevTotal = prevData.length;

    const escalated = filteredData.filter(r => (r['Requested Agent'] || '').toLowerCase() === 'yes').length;
    const escRate = total > 0 ? ((escalated / total) * 100).toFixed(1) + '%' : '0%';

    const positive = filteredData.filter(r => (r['Sentiment'] || '').toLowerCase() === 'positive').length;
    const negative = filteredData.filter(r => (r['Sentiment'] || '').toLowerCase() === 'negative').length;
    const neutral = total - positive - negative;

    const sentimentPcts = { pPct: '0%', nPct: '0%', uPct: '0%' };
    if (total > 0) {
        sentimentPcts.pPct = ((positive / total) * 100).toFixed(0) + '%';
        sentimentPcts.nPct = ((negative / total) * 100).toFixed(0) + '%';
        sentimentPcts.uPct = ((neutral / total) * 100).toFixed(0) + '%';
    }

    let msgSum = 0;
    let countWithMsg = 0;
    filteredData.forEach(r => {
        const msgs = parseInt(r['alhena_msgs']);
        if (!isNaN(msgs)) {
            msgSum += msgs;
            countWithMsg++;
        }
    });
    const avgMsgs = countWithMsg > 0 ? (msgSum / countWithMsg).toFixed(1) : '-';

    const csatScores = filteredData
        .map(r => parseInt(r['C-sat']))
        .filter(n => !isNaN(n) && n >= 1 && n <= 5);

    const avgCsat = csatScores.length > 0
        ? (csatScores.reduce((a, b) => a + b, 0) / csatScores.length).toFixed(1)
        : '-';

    const csatResponseRate = total > 0
        ? ((csatScores.length / total) * 100).toFixed(1) + '%'
        : '0%';

    const isValid = (val) => val && val.toLowerCase() !== 'na' && val.toLowerCase() !== 'null' && val.toLowerCase() !== 'false' && val.trim() !== '';

    const botIssueCount = filteredData.filter(r => isValid(r['Bot category'])).length;
    const websiteIssueCount = filteredData.filter(r => isValid(r['website issue category'])).length;
    const reasonNotBuyingCount = filteredData.filter(r => isValid(r['reason_not_buying_category'])).length;
    const angryReasonCount = filteredData.filter(r => isValid(r['anger_category'])).length;
    const deviceQualityCount = filteredData.filter(r => isValid(r['device_quality_category'])).length;
    const pricingTopicCount = filteredData.filter(r => isValid(r['pricing_category'])).length;

    const kpiData = {
        total, prevTotal, escalated, escRate, positive, negative, neutral,
        sentimentPcts, avgMsgs, avgCsat, csatResponseRate,
        botIssueCount, websiteIssueCount, reasonNotBuyingCount, angryReasonCount,
        deviceQualityCount, pricingTopicCount, isCompare // Add isCompare here
    };

    // --- Chart Data Preparation ---
    const volByDate = {};
    filteredData.forEach(r => {
        const dStr = r['First message date'];
        if (dStr) {
            const shortDate = dStr.split(' ')[0];
            volByDate[shortDate] = (volByDate[shortDate] || 0) + 1;
        }
    });
    const sortedDates = Object.keys(volByDate).sort();
    const volData = sortedDates.map(d => volByDate[d]);

    const catCounts = {};
    filteredData.forEach(r => {
        const c = r['Primary Category'] || 'Uncategorized';
        catCounts[c] = (catCounts[c] || 0) + 1;
    });

    const intentCounts = {};
    filteredData.forEach(r => {
        const i = r['Intent'] || 'Unknown';
        intentCounts[i] = (intentCounts[i] || 0) + 1;
    });
    const sortedIntents = Object.entries(intentCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const sentimentOrder = ['Negative', 'Neutral', 'Positive'];
    const csatBuckets = {
        'Negative': [0, 0, 0, 0, 0],
        'Neutral': [0, 0, 0, 0, 0],
        'Positive': [0, 0, 0, 0, 0]
    };
    filteredData.forEach(r => {
        const s = r['Sentiment'] || 'Neutral';
        const c = parseInt(r['C-sat']);
        if (sentimentOrder.includes(s) && !isNaN(c) && c >= 1 && c <= 5) {
            csatBuckets[s][c - 1]++;
        }
    });

    const issuesLandscapeCounts = [
        botIssueCount, websiteIssueCount, reasonNotBuyingCount, angryReasonCount,
        deviceQualityCount, pricingTopicCount
    ];

    const chartData = {
        sortedDates, volData,
        catCounts,
        sortedIntents,
        csatBuckets, sentimentOrder,
        issuesLandscapeCounts
    };

    // --- Recommendations Data Preparation ---
    const recMap = {};
    const negativeTickets = filteredData.filter(r => (r['Sentiment'] || '').toLowerCase() === 'negative');
    negativeTickets.forEach(r => {
        const rec = r['Recommendation'];
        if (rec && rec !== 'null' && rec !== 'empty') {
            recMap[rec] = (recMap[rec] || 0) + 1;
        }
    });
    const currentRecommendations = Object.entries(recMap).sort((a, b) => b[1] - a[1]);

    self.postMessage({ filteredData, kpiData, chartData, currentRecommendations });
};