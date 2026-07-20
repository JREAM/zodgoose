export class zodgooseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "zodgooseError";
  }
}
