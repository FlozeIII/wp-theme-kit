/** Minimum number of value arguments for a known PHP printf format. */
export function requiredPrintfArguments(format) {
  // Sticky matching prevents an unsupported conversion from being skipped over.
  const conversion = /(?:(?<value>\d+)\$)?(?:[-+ 0]|'[\x00-\x7f])*(?<width>[1-9]\d*|\*(?:\d+\$)?)?(?:\.(?<precision>\d*|\*(?:\d+\$)?))?l?(?<type>[bcdeEfFgGhHosuxX])/y;
  let next = 1;
  let required = 0;
  const consume = (position) => {
    const argument = position === undefined ? next++ : Number(position);
    if (!Number.isInteger(argument) || argument < 1 || argument >= 2147483647) return false;
    required = Math.max(required, argument);
    return true;
  };
  for (let index = 0; index < format.length; index++) {
    if (format[index] !== '%') continue;
    if (format[index + 1] === '%') {
      index++;
      continue;
    }
    conversion.lastIndex = index + 1;
    const match = conversion.exec(format);
    if (!match) return null;
    for (const field of [match.groups.width, match.groups.precision]) {
      if (!field?.startsWith('*')) {
        if (Number(field) >= 2147483647) return null;
        continue;
      }
      const position = field.length === 1 ? undefined : field.slice(1, -1);
      if (!consume(position)) return null;
    }
    if (!consume(match.groups.value)) return null;
    index = conversion.lastIndex - 1;
  }
  return required;
}
