declare module "adm-zip" {
  export default class AdmZip {
    constructor(buffer?: Buffer | string);
    getEntries(): Array<{
      entryName: string;
      isDirectory: boolean;
      getData(): Buffer;
    }>;
  }
}
