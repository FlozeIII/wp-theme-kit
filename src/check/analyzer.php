<?php
/**
 * Deep PHP tokenizer for wp-theme-kit.
 *
 * Usage: php analyzer.php <file> [<file> ...]
 *
 * Prints one JSON object:
 *   { "files": { "<path>": { "tokens": [...], "error": null } }, "errors": [] }
 *
 * Tokens use the same normalized shape as src/check/lexer-php.mjs so the rule
 * engine never has to know which analyzer produced them.
 */

error_reporting(0);
ini_set('display_errors', '0');

$files  = array_slice($argv, 1);
$result = array(
	'files'  => new stdClass(),
	'errors' => array(),
);

// The analyzer must run on PHP 7.4 as well as PHP 8.x. Constants introduced in
// newer versions get unique negative sentinels so they never match a real token.
$missing = 0;
foreach (
	array(
		'T_NULLSAFE_OBJECT_OPERATOR',
		'T_ATTRIBUTE',
		'T_NAME_QUALIFIED',
		'T_NAME_FULLY_QUALIFIED',
		'T_NAME_RELATIVE',
		'T_ENUM',
		'T_READONLY',
		'T_COALESCE_EQUAL',
		'T_MATCH',
	) as $constant
) {
	if ( ! defined( $constant ) ) {
		define( $constant, -1000 - $missing );
		$missing++;
	}
}

$keywords = array(
	'abstract', 'and', 'array', 'as', 'break', 'callable', 'case', 'catch', 'class',
	'clone', 'const', 'continue', 'declare', 'default', 'die', 'do', 'echo', 'else',
	'elseif', 'empty', 'enddeclare', 'endfor', 'endforeach', 'endif', 'endswitch',
	'endwhile', 'enum', 'eval', 'exit', 'extends', 'final', 'finally', 'fn', 'for',
	'foreach', 'function', 'global', 'goto', 'if', 'implements', 'include',
	'include_once', 'instanceof', 'insteadof', 'interface', 'isset', 'list', 'match',
	'namespace', 'new', 'or', 'print', 'private', 'protected', 'public', 'readonly',
	'require', 'require_once', 'return', 'static', 'switch', 'throw', 'trait', 'try',
	'unset', 'use', 'var', 'while', 'xor', 'yield', 'true', 'false', 'null',
);

$keyword_map = array_flip( $keywords );

$operators = array(
	T_OBJECT_OPERATOR              => '->',
	T_NULLSAFE_OBJECT_OPERATOR     => '?->',
	T_DOUBLE_COLON                 => '::',
	T_DOUBLE_ARROW                 => '=>',
	T_ELLIPSIS                     => '...',
	T_COALESCE                     => '??',
	T_COALESCE_EQUAL               => '??=',
	T_POW                          => '**',
	T_POW_EQUAL                    => '**=',
	T_BOOLEAN_AND                  => '&&',
	T_BOOLEAN_OR                   => '||',
	T_IS_EQUAL                     => '==',
	T_IS_NOT_EQUAL                 => '!=',
	T_IS_IDENTICAL                 => '===',
	T_IS_NOT_IDENTICAL             => '!==',
	T_IS_SMALLER_OR_EQUAL          => '<=',
	T_IS_GREATER_OR_EQUAL          => '>=',
	T_SPACESHIP                    => '<=>',
	T_SL                           => '<<',
	T_SR                           => '>>',
	T_INC                          => '++',
	T_DEC                          => '--',
	T_PLUS_EQUAL                   => '+=',
	T_MINUS_EQUAL                  => '-=',
	T_MUL_EQUAL                    => '*=',
	T_DIV_EQUAL                    => '/=',
	T_CONCAT_EQUAL                 => '.=',
	T_MOD_EQUAL                    => '%=',
	T_AND_EQUAL                    => '&=',
	T_OR_EQUAL                     => '|=',
	T_XOR_EQUAL                    => '^=',
	T_SL_EQUAL                     => '<<=',
	T_SR_EQUAL                     => '>>=',
	T_ATTRIBUTE                    => '#[',
	T_NS_SEPARATOR                 => '\\',
);

function wptk_tokenize( $source, $operators, $keyword_map ) {
	$raw    = token_get_all( $source );
	$tokens = array();
	$line   = 1;

	foreach ( $raw as $item ) {
		if ( is_string( $item ) ) {
			$text  = $item;
			$at    = $line;
			$type  = 'punct';
			$extra = array();
			$line += substr_count( $text, "\n" );
			$tokens[] = array_merge(
				array( 'type' => $type, 'value' => $text, 'line' => $at ),
				$extra
			);
			continue;
		}

		list( $id, $text, $at ) = $item;
		$line = $at;
		$type = 'ident';
		$extra = array();

		switch ( $id ) {
			case T_OPEN_TAG:
				$type = 'open_tag';
				break;
			case T_OPEN_TAG_WITH_ECHO:
				$type = 'open_tag_echo';
				break;
			case T_CLOSE_TAG:
				$type = 'close_tag';
				break;
			case T_INLINE_HTML:
				$type = 'inline_html';
				break;
			case T_WHITESPACE:
				$type = 'whitespace';
				break;
			case T_COMMENT:
			case T_DOC_COMMENT:
				$type = 'comment';
				break;
			case T_VARIABLE:
				$type = 'var';
				break;
			case T_STRING:
			case T_NAME_QUALIFIED:
			case T_NAME_FULLY_QUALIFIED:
			case T_NAME_RELATIVE:
				$lower = strtolower( $text );
				$type  = isset( $keyword_map[ $lower ] ) ? 'keyword' : 'ident';
				break;
			case T_CONSTANT_ENCAPSED_STRING:
				$type  = 'string';
				$extra = array(
					'quoted'       => ( substr( $text, 0, 1 ) === "'" ) ? 'single' : 'double',
					'interpolated' => false,
				);
				break;
			case T_ENCAPSED_AND_WHITESPACE:
				$type  = 'string';
				$extra = array(
					'quoted'       => 'double',
					'interpolated' => true,
					'partial'      => true,
				);
				break;
			case T_START_HEREDOC:
				$type  = 'string';
				$extra = array(
					'quoted'       => 'heredoc',
					'interpolated' => true,
					'partial'      => true,
				);
				break;
			case T_END_HEREDOC:
				// Keep the closing label in the token stream so token values
				// concatenate back to the source and inline-HTML offsets stay true.
				$type = 'punct';
				break;
			case T_LNUMBER:
			case T_DNUMBER:
				$type = 'number';
				break;
			case T_STRING_VARNAME:
			case T_NUM_STRING:
				$type = 'var';
				break;
			case T_CURLY_OPEN:
			case T_DOLLAR_OPEN_CURLY_BRACES:
				$type = 'punct';
				break;
			default:
				if ( isset( $operators[ $id ] ) ) {
					$type  = 'punct';
					$text  = $operators[ $id ];
				} else {
					$name  = token_name( $id );
					$lower = strtolower( substr( $name, 2 ) );
					$type  = isset( $keyword_map[ $lower ] ) ? 'keyword' : 'ident';
					// PHP 8.1 returns dedicated ampersand tokens (T_AMPERSAND_*).
					if ( '&' === $text ) {
						$type = 'punct';
					}
				}
				break;
		}

		$tokens[] = array_merge(
			array( 'type' => $type, 'value' => $text, 'line' => $at ),
			$extra
		);
		$line += substr_count( $text, "\n" );
	}

	return $tokens;
}

foreach ( $files as $file ) {
	if ( ! is_file( $file ) ) {
		$result['files']->{$file} = array( 'tokens' => array(), 'error' => 'not found' );
		continue;
	}

	$source = file_get_contents( $file );
	if ( false === $source ) {
		$result['files']->{$file} = array( 'tokens' => array(), 'error' => 'unreadable' );
		continue;
	}

	try {
		$tokens = wptk_tokenize( $source, $operators, $keyword_map );
		$result['files']->{$file} = array( 'tokens' => $tokens, 'error' => null );
	} catch ( Throwable $error ) {
		$result['files']->{$file} = array( 'tokens' => array(), 'error' => $error->getMessage() );
		$result['errors'][]       = array( 'file' => $file, 'message' => $error->getMessage() );
	}
}

$json = json_encode( $result, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
if ( false === $json ) {
	fwrite( STDERR, 'analyzer: json_encode failed' . "\n" );
	exit( 1 );
}

echo $json, "\n";
