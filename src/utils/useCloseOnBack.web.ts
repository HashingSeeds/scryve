/** why: react-native-web's BackHandler logs an error on every subscription, and the browser's Back is the router's job. */
export function useCloseOnBack(_open: boolean, _onClose: () => void) {}
