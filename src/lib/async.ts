export class ActionTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionTimeoutError";
  }
}

export async function withTimeout<T>(
  value: PromiseLike<T>,
  ms = 15_000,
  message = "This action is taking too long. Please try again.",
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      Promise.resolve(value),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new ActionTimeoutError(message)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
