import type { __IChatFunctionReference } from "./__IChatFunctionReference";

export interface __IChatSelectFunctionsApplication {
  /**
  * This function will return parameter info for all candidate functions fed in.
  * Assign one or more functions you think would fit the use case.
  * For example, if the user wants to call a function called `multiply`, you must put `multiply` in the `functions` property.
  * If you're not sure with functions to use, add all candidate functions into the `functions`
  * @param props Properties of the function
  */
  selectFunctions: (props: __IChatFunctionReference.IProps) => Promise<void>;
}
