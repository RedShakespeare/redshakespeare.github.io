export async function destroyControllersInReverse(controllers, diagnostics) {
  for (let index = controllers.length - 1; index >= 0; index -= 1) {
    try {
      await controllers[index].destroy();
    } catch (error) {
      diagnostics.report('destroy', error);
    }
  }
}
