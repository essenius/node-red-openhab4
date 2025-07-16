/*
// Test the naming logic for the in node
console.log('🧪 Testing node naming logic...\n');

// Mock config objects
const configs = [
    { name: "Custom Name", itemname: "LivingRoom_Light" },
    { name: "", itemname: "Kitchen_Switch" },
    { name: undefined, itemname: "Bedroom_Lamp" },
    { itemname: "Garage_Door" },
    { name: "", itemname: "" },
    { itemname: "" },
    {}
];

// Test the naming logic
configs.forEach((config, index) => {
    const itemName = (config.itemname || "").trim();
    const name = config.name || (itemName ? `openhab4-in (${itemName})` : 'openhab4-in');
    
    console.log(`Test ${index + 1}:`);
    console.log(`  Config: ${JSON.stringify(config)}`);
    console.log(`  Resulting name: "${name}"`);
    console.log('');
});
*/