current url: rss.denbroeder.eu/host/assessment
(denbroeder.eu/host/airad also forwards to the page above)


calculation of the vulnerability score:
For each assessment component:
1. Assign a risk score based on its exposure level:  
   - low = 1, medium = 2, high = 3 (with small tweaks, e.g. peer review in-class = 1, presentation with Q&A = 1.25);
2. Multiply that by the component’s weight in the final grade;
3. Sum over all components → `weighted`.  
4. Also sum the weights → `total`.  
5. Compute:
   $$
   vulnerability = \text{round}\left(\frac{weighted - total}{total \cdot 2} \cdot 100\right)
   $$   
 and cap it if there is a non‑compensable in‑person exam.[7][10]

