const presets = [
  ['AC', 'Air conditioning', 'Air conditioner'],
  ['Free Wi-Fi', 'Free Wifi', 'Wi-Fi'],
  ['Breakfast', 'Breakfast included'],
  ['Private bathroom', 'En-suite bathroom'],
  ['Hot water', 'Hot shower'],
  ['Television', 'TV'],
  ['Refrigerator', 'Fridge', 'Mini fridge'],
  ['Work desk', 'Desk'],
  ['Balcony'],
  ['Room service'],
  ['Electric kettle', 'Kettle'],
  ['Ceiling fan', 'Fan'],
];
const normalize = name => name.toLowerCase().replace(/[^a-z0-9]/g, '');
export function amenitySuggestions(existing) {
  const names = new Set(existing.map(a => normalize(a.name)));
  return presets.filter(aliases => !aliases.some(name => names.has(normalize(name)))).map(([name]) => name);
}
export function amenityPresetOptions(existing) {
  return presets.map(aliases => ({
    name: aliases[0],
    amenity: existing.find(a => aliases.some(name => normalize(name) === normalize(a.name))),
  }));
}
