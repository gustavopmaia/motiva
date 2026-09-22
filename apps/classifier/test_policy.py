import unittest
from policy import classify_probability, validate_thresholds


class PolicyTests(unittest.TestCase):
    def test_boundaries_preserve_contract(self):
        self.assertEqual(classify_probability(0.1, 0.4, 0.7), ("ok", 0.9))
        self.assertEqual(classify_probability(0.4, 0.4, 0.7), ("attention", 0.4))
        self.assertEqual(classify_probability(0.7, 0.4, 0.7), ("urgent", 0.7))

    def test_rejects_invalid_model_outputs(self):
        for value in [float("nan"), float("inf"), -0.01, 1.01]:
            with self.assertRaises(ValueError):
                classify_probability(value, 0.4, 0.7)

    def test_rejects_invalid_configuration(self):
        for attention, urgent in [(0.8, 0.4), (0.4, 0.4), (0, 0.7), (0.4, 1)]:
            with self.assertRaises(ValueError):
                validate_thresholds(attention, urgent)


if __name__ == "__main__":
    unittest.main()
