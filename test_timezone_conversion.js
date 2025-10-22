// Test script to verify timezone conversion logic
// Run with: node test_timezone_conversion.js

console.log("=== Testing Frontend Timezone Conversion ===\n");

// Simulate the frontend conversion logic
function testFrontendConversion() {
    // Test case 1: Local time input (simulating datetime-local input)
    const localTimeInput = "2024-01-15T14:30"; // 2:30 PM local time
    
    console.log("1. Frontend Local → UTC Conversion:");
    console.log(`   Input (datetime-local): ${localTimeInput}`);
    
    // This is what our frontend does:
    const utcResult = new Date(localTimeInput).toISOString();
    console.log(`   Output (UTC): ${utcResult}`);
    
    // Verify the conversion
    const inputDate = new Date(localTimeInput);
    const utcDate = new Date(utcResult);
    console.log(`   Local timezone offset: ${inputDate.getTimezoneOffset()} minutes`);
    console.log(`   Conversion correct: ${inputDate.getTime() === utcDate.getTime()}`);
    
    return utcResult;
}

// Test case 2: UTC → Local conversion (for form reset)
function testFrontendReset(utcString) {
    console.log("\n2. Frontend UTC → Local Conversion:");
    console.log(`   Input (UTC from backend): ${utcString}`);
    
    // This is what our frontend does for form reset:
    const localResult = new Date(utcString).toISOString().substring(0, 16);
    console.log(`   Output (datetime-local): ${localResult}`);
    
    // Verify the conversion
    const originalUtc = new Date(utcString);
    const convertedLocal = new Date(localResult);
    console.log(`   Conversion correct: ${originalUtc.getTime() === convertedLocal.getTime()}`);
    
    return localResult;
}

// Test case 3: Round-trip conversion
function testRoundTrip() {
    console.log("\n3. Round-trip Conversion Test:");
    
    const originalLocal = "2024-01-15T14:30";
    console.log(`   Original local time: ${originalLocal}`);
    
    // Local → UTC
    const utc = new Date(originalLocal).toISOString();
    console.log(`   Converted to UTC: ${utc}`);
    
    // UTC → Local
    const backToLocal = new Date(utc).toISOString().substring(0, 16);
    console.log(`   Converted back to local: ${backToLocal}`);
    
    // Check if they're the same
    const originalDate = new Date(originalLocal);
    const roundTripDate = new Date(backToLocal);
    console.log(`   Round-trip successful: ${originalDate.getTime() === roundTripDate.getTime()}`);
}

// Test case 4: Different timezones simulation
function testDifferentTimezones() {
    console.log("\n4. Different Timezone Simulation:");
    
    // Simulate different timezone scenarios
    const testCases = [
        { local: "2024-01-15T14:30", description: "Local time (your timezone)" },
        { local: "2024-01-15T09:30", description: "UTC-5 (EST)" },
        { local: "2024-01-15T23:30", description: "UTC+9 (JST)" }
    ];
    
    testCases.forEach((testCase, index) => {
        console.log(`   Test ${index + 1}: ${testCase.description}`);
        console.log(`   Input: ${testCase.local}`);
        
        const utc = new Date(testCase.local).toISOString();
        console.log(`   UTC: ${utc}`);
        
        const backToLocal = new Date(utc).toISOString().substring(0, 16);
        console.log(`   Back to local: ${backToLocal}`);
        console.log(`   Match: ${testCase.local === backToLocal}\n`);
    });
}

// Run all tests
console.log("Current timezone offset:", new Date().getTimezoneOffset(), "minutes");
console.log("Current timezone:", Intl.DateTimeFormat().resolvedOptions().timeZone);
console.log("Current time:", new Date().toISOString());
console.log("");

const utcResult = testFrontendConversion();
testFrontendReset(utcResult);
testRoundTrip();
testDifferentTimezones();

console.log("=== Test Complete ===");
