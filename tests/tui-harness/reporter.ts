export function reportPlanHeader(total: number): void {
  console.log('TAP version 14');
  console.log(`1..${total}`);
}

export function reportPass(index: number, name: string): void {
  console.log(`ok ${index} - ${name}`);
}

export function reportFail(index: number, name: string, err: Error): void {
  console.log(`not ok ${index} - ${name}`);
  console.log(`  # ${err.message.split('\n')[0]}`);
}

export function reportSummary(passed: number, failed: number): void {
  console.log(`# passed: ${passed}`);
  console.log(`# failed: ${failed}`);
}
