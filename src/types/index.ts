export interface IJscpdResult {
  statistics: any;
  duplicates: IDuplicate[];
}

export interface IDuplicate {
  firstFile: IFile;
  secondFile: IFile;
  fragment: string;
}

interface IFile {
  startLoc: ILoc;
  endLoc: ILoc;
  blame: Record<number, IBlame>;
  name: string;
}

interface ILoc {
  line: number;
  column: number;
}

export interface IBlame {
  author: string;
  date: string;
}
