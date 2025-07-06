import type { __IChatFunctionReference } from "./__IChatFunctionReference";

export interface __IChatSelectFunctionsApplication {
  /**
  * Select the appropriate API functions to invoke based on the user’s request.
  * If you don't need to call functions or tools, DO NOT CALL THIS FUNCTION.
  * 
  * If you found some proper API functions to call, select the API functions via calling THIS function.
  *
  * For example, if the user wants to call a function called `multiply`, you must put `multiply` in the `functions` property. 
  * If the user requested to call multiple functions, you have to assign all into the `functions` property.
  *
  * @param props Properties of the function
  */
  selectFunctions: (props: __IChatFunctionReference.IProps) => Promise<void>;
}
