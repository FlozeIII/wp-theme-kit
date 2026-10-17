<?php
/**
 * Site footer.
 *
 * @package {{name}}
 */
?>
</main>
<footer class="site-footer">
	<?php
	printf(
		/* translators: %1$s: current year, %2$s: site name. */
		esc_html__( '© %1$s %2$s', '{{textDomain}}' ),
		esc_html( gmdate( 'Y' ) ),
		esc_html( get_bloginfo( 'name' ) )
	);
	?>
</footer>
<?php wp_footer(); ?>
</body>
</html>
