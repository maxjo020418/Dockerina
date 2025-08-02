import type { __IChatFunctionReference } from "./__IChatFunctionReference";

export interface __IChatCancelFunctionsApplication {
  /**
   * Cancels selected functions from the candidate call list.
   *
   * Use this function when:
   * - The user explicitly requests cancellation of certain candidate functions.
   * - Multiple candidate functions are selected due to unclear or ambiguous user input (candidate pooling), and unnecessary functions need removal.
   *
   * To cancel the same function multiple times, include its name repeatedly in the `functions` array.
   *
   * @param props Properties of the function.
   */
  cancelFunctions: (props: __IChatFunctionReference.IProps) => Promise<void>;
}
