// Host unit tests for headers/addons/mod_shortcut_engine.h
// Run: tests/mod_shortcut/run.sh
#include "addons/mod_shortcut_engine.h"

#include <cstdio>
#include <cstdlib>
#include <vector>

using namespace modshortcut;

static int failures = 0;
#define CHECK(cond) do { if (!(cond)) { std::printf("%s:%d: CHECK failed: %s\n", __FILE__, __LINE__, #cond); failures++; } } while (0)
#define CHECK_EQ(a, b) do { auto _a = (a); auto _b = (b); if (!(_a == _b)) { std::printf("%s:%d: CHECK_EQ failed: %s (%lld) != %s (%lld)\n", __FILE__, __LINE__, #a, (long long)_a, #b, (long long)_b); failures++; } } while (0)

// GamepadState.h values
constexpr uint32_t B3 = 1u << 2;  // XInput X
constexpr uint32_t L3 = 1u << 10;
constexpr uint32_t DU = 1u << 16, DD = 1u << 17, DL = 1u << 18, DR = 1u << 19;
constexpr uint8_t U = DPAD_UP, D = DPAD_DOWN, L = DPAD_LEFT, R = DPAD_RIGHT;

static const uint32_t parrySteps[] = { packStep(L3, 1) };
static const uint32_t dpRightSteps[] = { packStep(DR, 2), packStep(DD, 2), packStep(DD | DR, 2), packStep(DD | DR | B3, 3) };
static const uint32_t dpLeftSteps[] = { packStep(DL, 2), packStep(DD, 2), packStep(DD | DL, 2), packStep(DD | DL | B3, 3) };

static const RuleView defaultRules[] = {
    { true, true, directionBit(5), parrySteps, 1 },
    { true, false, directionBit(4) | directionBit(1), dpRightSteps, 4 },
    { true, false, directionBit(6) | directionBit(3), dpLeftSteps, 4 },
};

struct Out { uint8_t dpad; uint32_t buttons; };

// Simulates one 1 ms poll.
struct Sim {
    Engine engine;
    const RuleView* rules;
    size_t count;
    uint64_t now = 1000000;
    explicit Sim(const RuleView* r, size_t c) : rules(r), count(c) { engine.reset(); }
    Out poll(bool mod, uint8_t dpad, uint32_t buttons = 0, uint64_t advanceUs = 1000) {
        engine.process(mod, dpad, buttons, now, rules, count);
        now += advanceUs;
        return { dpad, buttons };
    }
};

// Records the reported state for every 1 ms poll and collapses it into runs.
struct Run { uint8_t dpad; uint32_t buttons; int ms; };
static std::vector<Run> record(Sim& sim, int ms, bool modHeldMs, int modMs, uint8_t lever, uint32_t buttons = 0) {
    std::vector<Run> runs;
    for (int i = 0; i < ms; i++) {
        bool mod = modHeldMs && i < modMs;
        Out o = sim.poll(mod, lever, buttons);
        if (!runs.empty() && runs.back().dpad == o.dpad && runs.back().buttons == o.buttons) runs.back().ms++;
        else runs.push_back({ o.dpad, o.buttons, 1 });
    }
    return runs;
}

static void testNumpad() {
    CHECK_EQ(numpadDirection(0), 5);
    CHECK_EQ(numpadDirection(D | L), 1);
    CHECK_EQ(numpadDirection(D), 2);
    CHECK_EQ(numpadDirection(D | R), 3);
    CHECK_EQ(numpadDirection(L), 4);
    CHECK_EQ(numpadDirection(R), 6);
    CHECK_EQ(numpadDirection(U | L), 7);
    CHECK_EQ(numpadDirection(U), 8);
    CHECK_EQ(numpadDirection(U | R), 9);
    CHECK_EQ(numpadDirection(L | R), 5);     // SOCD cancels
    CHECK_EQ(numpadDirection(L | R | D), 2);
    CHECK_EQ(numpadDirection(U | D | R), 6);
}

static void testPacking() {
    CHECK_EQ(stepFrames(packStep(DR, 2)), 2u);
    CHECK_EQ(stepFrames(packStep(DR, 0)), 1u);       // 0 frames -> 1
    CHECK_EQ(stepFrames(packStep(DR, 1000)), 255u);  // clamped
    CHECK_EQ(stepDpad(packStep(DD | DR | B3, 3)), D | R);
    CHECK_EQ(stepButtons(packStep(DD | DR | B3, 3)), B3);
}

static void expectDp(const std::vector<Run>& runs, uint8_t forward, uint8_t leverAfter) {
    // 2F forward, 2F down, 2F down-forward, 3F down-forward + X, then the physical lever.
    CHECK(runs.size() >= 5);
    if (runs.size() < 5) return;
    CHECK_EQ(runs[0].dpad, forward); CHECK_EQ(runs[0].buttons, 0u); CHECK_EQ(runs[0].ms, 34);
    CHECK_EQ(runs[1].dpad, D);       CHECK_EQ(runs[1].buttons, 0u); CHECK_EQ(runs[1].ms, 33);
    CHECK_EQ(runs[2].dpad, D | forward); CHECK_EQ(runs[2].buttons, 0u); CHECK_EQ(runs[2].ms, 34);
    CHECK_EQ(runs[3].dpad, D | forward); CHECK_EQ(runs[3].buttons, B3); CHECK_EQ(runs[3].ms, 50);
    CHECK_EQ(runs[4].dpad, leverAfter);  CHECK_EQ(runs[4].buttons, 0u);
}

static void testDpFromBack() {
    // Lever at 4 (guarding as P1), short Mod tap: 623+X towards the right.
    Sim sim(defaultRules, 3);
    auto runs = record(sim, 300, true, 30, L);
    expectDp(runs, R, L);
}

static void testDpFromDownBack() {
    Sim sim(defaultRules, 3);
    auto runs = record(sim, 300, true, 300, D | L);  // Mod held through the whole motion
    expectDp(runs, R, D | L);
}

static void testDpMirrored() {
    Sim sim(defaultRules, 3);
    auto runs = record(sim, 300, true, 30, D | R);
    expectDp(runs, L, D | R);
    Sim sim2(defaultRules, 3);
    runs = record(sim2, 300, true, 30, R);
    expectDp(runs, L, R);
}

static void testSequenceIsExclusive() {
    // Buttons physically pressed during the motion must not leak.
    Sim sim(defaultRules, 3);
    auto runs = record(sim, 300, true, 30, L, L3 | 1u);
    CHECK_EQ(runs[0].buttons, 0u);
    CHECK_EQ(runs[3].buttons, B3);
    CHECK_EQ(runs.back().buttons, L3 | 1u);  // passes through again afterwards
}

static void testParryHold() {
    Sim sim(defaultRules, 3);
    Out o = sim.poll(false, 0);
    CHECK_EQ(o.buttons, 0u);
    for (int i = 0; i < 100; i++) {
        o = sim.poll(true, 0, B3);
        CHECK_EQ(o.buttons, L3 | B3);  // additive
        CHECK_EQ(o.dpad, 0);
    }
    // Lever moves while still holding Mod: parry keeps going, lever passes through.
    o = sim.poll(true, L);
    CHECK_EQ(o.buttons, L3);
    CHECK_EQ(o.dpad, L);
    o = sim.poll(false, L);
    CHECK_EQ(o.buttons, 0u);
    CHECK(sim.engine.getMode() == Engine::Mode::IDLE);
}

static void testUnmappedDirection() {
    Sim sim(defaultRules, 3);
    for (uint8_t lever : { (uint8_t)U, (uint8_t)(U | L), (uint8_t)(U | R), (uint8_t)D }) {
        sim.engine.reset();
        Out o = sim.poll(true, lever, 1u);
        CHECK_EQ(o.dpad, lever);
        CHECK_EQ(o.buttons, 1u);
        CHECK(sim.engine.getMode() == Engine::Mode::IDLE);
        sim.poll(false, lever);
    }
}

static void testDirectionSampledOnlyAtPress() {
    // Press Mod at neutral (parry), then move to 4 while holding: no DP.
    Sim sim(defaultRules, 3);
    sim.poll(true, 0);
    Out o = sim.poll(true, L);
    CHECK_EQ(o.dpad, L);
    CHECK_EQ(o.buttons, L3);
    // Holding 4 and pressing Mod while it is already held does nothing new.
    CHECK(sim.engine.getMode() == Engine::Mode::HOLD);
}

static void testRepressDuringSequenceIgnored() {
    Sim sim(defaultRules, 3);
    std::vector<Run> runs;
    for (int i = 0; i < 300; i++) {
        bool mod = (i < 10) || (i >= 40 && i < 50);  // second tap at 40 ms, lever now at 6
        uint8_t lever = i < 40 ? L : R;
        Out o = sim.poll(mod, lever);
        if (!runs.empty() && runs.back().dpad == o.dpad && runs.back().buttons == o.buttons) runs.back().ms++;
        else runs.push_back({ o.dpad, o.buttons, 1 });
    }
    expectDp(runs, R, R);
    CHECK_EQ(runs.size(), 5u);
}

static void testFirstMatchingEnabledRuleWins() {
    static const uint32_t a[] = { packStep(1u, 1) };
    static const uint32_t b[] = { packStep(2u, 1) };
    static const uint32_t c[] = { packStep(4u, 1) };
    const RuleView rules[] = {
        { false, true, directionBit(5), a, 1 },  // disabled
        { true, true, directionBit(5), b, 0 },   // no steps
        { true, true, directionBit(5), c, 1 },
        { true, true, directionBit(5), a, 1 },
    };
    Sim sim(rules, 4);
    Out o = sim.poll(true, 0);
    CHECK_EQ(o.buttons, 4u);
}

static void testLatePollKeepsTiming() {
    // Polls arriving late must not stretch the sequence.
    Sim sim(defaultRules, 3);
    sim.poll(true, L, 0, 40000);    // t=0: step 0; next poll at 40 ms
    Out o = sim.poll(true, L, 0, 30000); // t=40ms -> step 1 (33.3..66.7ms)
    CHECK_EQ(o.dpad, D);
    o = sim.poll(true, L, 0, 70000);     // t=70ms -> step 2 (66.7..100ms)
    CHECK_EQ(o.dpad, D | R);
    o = sim.poll(true, L, 0, 1000);      // t=140ms -> step 3 (100..150ms)
    CHECK_EQ(o.buttons, B3);
    sim.now += 20000;
    o = sim.poll(true, L);               // t=161ms -> done
    CHECK_EQ(o.dpad, L);
    CHECK(sim.engine.getMode() == Engine::Mode::IDLE);
}

static void testNoRules() {
    Sim sim(nullptr, 0);
    Out o = sim.poll(true, L, 3u);
    CHECK_EQ(o.dpad, L);
    CHECK_EQ(o.buttons, 3u);
}

int main() {
    testNumpad();
    testPacking();
    testDpFromBack();
    testDpFromDownBack();
    testDpMirrored();
    testSequenceIsExclusive();
    testParryHold();
    testUnmappedDirection();
    testDirectionSampledOnlyAtPress();
    testRepressDuringSequenceIgnored();
    testFirstMatchingEnabledRuleWins();
    testLatePollKeepsTiming();
    testNoRules();
    if (failures) {
        std::printf("%d check(s) failed\n", failures);
        return EXIT_FAILURE;
    }
    std::printf("mod_shortcut engine: all tests passed\n");
    return EXIT_SUCCESS;
}
