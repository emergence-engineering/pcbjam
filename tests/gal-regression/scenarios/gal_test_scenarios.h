/**
 * GAL Test Scenarios
 *
 * Defines test scenarios for visual regression testing of GAL rendering.
 * These scenarios use KiCad's GAL API to test the rendering pipeline.
 */

#ifndef GAL_TEST_SCENARIOS_H
#define GAL_TEST_SCENARIOS_H

// Forward declaration
namespace KIGFX {
    class GAL;
}

namespace GALTest {

/**
 * Get the number of test scenarios
 */
int GetScenarioCount();

/**
 * Get the name of a scenario
 */
const char* GetScenarioName(int index);

/**
 * Render a scenario using KiCad's GAL API
 *
 * @param gal Pointer to the GAL instance (OPENGL_GAL or WEBGL_GAL)
 * @param index Scenario index
 * @param width Canvas width in logical pixels
 * @param height Canvas height in logical pixels
 */
void RenderScenario(KIGFX::GAL* gal, int index, int width, int height);

}  // namespace GALTest

#endif // GAL_TEST_SCENARIOS_H
